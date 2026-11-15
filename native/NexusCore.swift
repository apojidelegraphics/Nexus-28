// NexusCore — tiny macOS helper for Nexus Desktop.
// Speaks newline-delimited JSON over stdin/stdout.
//
//   in : {"cmd":"info"}
//        {"cmd":"listen","id":"x","locale":"en-US"}   start on-device speech recognition
//        {"cmd":"stop","id":"x"}                      stop listening, emit final transcript
//        {"cmd":"cancel","id":"x"}                    stop listening, discard
//        {"cmd":"fm","id":"x","system":"…","prompt":"…"}  Apple Foundation Models
//        {"cmd":"front_window","id":"x","exclude":[pid]}     frontmost window (not Nexus): id, app, title
//        {"cmd":"ocr","id":"x","path":"…png"}             text in an image (Vision, on-device)
//        {"cmd":"pdf_text","id":"x","path":"…pdf"}        text in a PDF (PDFKit)
//        {"cmd":"ax_status","id":"x","prompt":true}           Accessibility permission (optionally ask)
//        {"cmd":"selected_text","id":"x","copy":true}          text selected in the front app (AX, or ⌘C fallback)
//        {"cmd":"sel_watch_start","pid":123} / {"cmd":"sel_watch_stop"}   highlight orb: watch for highlighted text (read-only)
//   out: {"event":"sel_watch","ok":true|false,"error":"AX_DENIED"|"TAP_FAILED"}
//        {"event":"selection","text":"…","app":"Safari","bundle":"com.apple.Safari","x":0,"y":0}   {"event":"sel_clear"}
//   out: {"event":"info","stt":true,"fm":"available"|"<reason>"}
//        {"event":"listening","id":"x"} {"event":"level","id":"x","level":0.0-1.0}
//        {"event":"partial","id":"x","text":"…"} {"event":"final","id":"x","text":"…"}
//        {"event":"fm","id":"x","text":"…"} {"event":"error","id":"x","error":"…"}
//
// Build: scripts/build-helper.sh (needs Xcode Command Line Tools).

import Foundation
import AVFoundation
import Speech
import EventKit
import Vision
import PDFKit
import AppKit
import ApplicationServices
#if canImport(FoundationModels)
import FoundationModels
#endif

let writeQueue = DispatchQueue(label: "nexuscore.out")

func emit(_ obj: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: obj) else { return }
    writeQueue.sync {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([0x0A]))
    }
}

// MARK: - Speech recognition

final class Flag { var value = false }

final class Listener {
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var sessionId = ""
    private var lastText = ""
    private var audioRunning = false
    private var finalSent = true
    private var levelTick = 0

    func start(id: String, locale: String?) {
        cancel()
        sessionId = id
        finalSent = false
        let answered = Flag()
        // If macOS never answers the permission request (can happen for unbundled helpers), don't hang.
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
            guard let self, !answered.value, self.sessionId == id, !self.finalSent else { return }
            self.fail("macOS didn't answer the Speech Recognition permission request. Check System Settings → Privacy & Security → Speech Recognition, or switch the speech-to-text engine in Nexus settings.")
        }
        SFSpeechRecognizer.requestAuthorization { status in
            DispatchQueue.main.async {
                answered.value = true
                guard self.sessionId == id, !self.finalSent else { return }
                guard status == .authorized else {
                    self.fail("Speech Recognition permission is off. Turn it on in System Settings → Privacy & Security → Speech Recognition, or switch the speech-to-text engine in Nexus settings.")
                    return
                }
                self.begin(locale: locale)
            }
        }
    }

    private func begin(locale: String?) {
        let id = sessionId
        var recognizer: SFSpeechRecognizer? = nil
        if let locale, !locale.isEmpty { recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)) }
        if recognizer == nil { recognizer = SFSpeechRecognizer() }
        guard let rec = recognizer, rec.isAvailable else {
            fail("Speech recognition isn't available for this language right now.")
            return
        }

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        if rec.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
        if #available(macOS 13.0, *) { req.addsPunctuation = true }
        request = req

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            fail("No microphone input found.")
            return
        }
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            self.request?.append(buffer)
            self.levelTick += 1
            if self.levelTick % 3 == 0, let ch = buffer.floatChannelData?[0] {
                let n = Int(buffer.frameLength)
                var sum: Float = 0
                for i in 0..<n { sum += ch[i] * ch[i] }
                let rms = n > 0 ? sqrt(sum / Float(n)) : 0
                emit(["event": "level", "id": id, "level": min(1.0, Double(rms) * 12.0)])
            }
        }
        engine.prepare()
        do { try engine.start() } catch {
            input.removeTap(onBus: 0)
            fail("Microphone could not start: \(error.localizedDescription)")
            return
        }
        audioRunning = true
        lastText = ""
        emit(["event": "listening", "id": id])

        task = rec.recognitionTask(with: req) { [weak self] result, error in
            DispatchQueue.main.async {
                guard let self, self.sessionId == id, !self.finalSent else { return }
                if let result {
                    self.lastText = result.bestTranscription.formattedString
                    if result.isFinal { self.finish(); return }
                    emit(["event": "partial", "id": id, "text": self.lastText])
                }
                if error != nil { self.finish() } // e.g. "no speech detected" → final with what we have
            }
        }
    }

    func stop(id: String) {
        guard id == sessionId, !finalSent else { return }
        stopAudio()
        request?.endAudio()
        // The recognizer normally returns an isFinal result quickly; don't wait forever.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard let self, self.sessionId == id else { return }
            self.finish()
        }
    }

    func cancel() {
        stopAudio()
        task?.cancel()
        task = nil
        request = nil
        finalSent = true
    }

    private func stopAudio() {
        guard audioRunning else { return }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        audioRunning = false
    }

    private func finish() {
        guard !finalSent else { return }
        finalSent = true
        stopAudio()
        task?.finish()
        task = nil
        request = nil
        emit(["event": "final", "id": sessionId, "text": lastText])
    }

    private func fail(_ message: String) {
        let id = sessionId
        cancel()
        emit(["event": "error", "id": id, "error": message])
    }
}

// MARK: - "Hey Nexus" wake word (on-device only; audio never leaves the Mac)

final class WakeWord {
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var running = false
    private var generation = 0
    private var restartWork: DispatchWorkItem?
    private let pattern: NSRegularExpression? = try? NSRegularExpression(
        pattern: "\\b(hey|hi|okay|ok|yo)[ ,.]+(nexus|nexis|nexxus|nexes|next us)\\b",
        options: [.caseInsensitive])

    func start() {
        if running { return }
        running = true
        SFSpeechRecognizer.requestAuthorization { status in
            DispatchQueue.main.async {
                guard self.running else { return }
                guard status == .authorized else {
                    self.running = false
                    emit(["event": "wake_error", "error": "Speech Recognition permission is off, so \"Hey Nexus\" can't listen."])
                    return
                }
                self.begin()
            }
        }
    }

    func stop() {
        running = false
        teardown()
    }

    private func fail(_ message: String) {
        running = false
        teardown()
        emit(["event": "wake_error", "error": message])
    }

    private func begin() {
        guard running else { return }
        var recognizer: SFSpeechRecognizer? = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
        if recognizer == nil { recognizer = SFSpeechRecognizer() }
        guard let rec = recognizer, rec.isAvailable else { fail("Speech recognition isn't available right now."); return }
        guard rec.supportsOnDeviceRecognition else { fail("This Mac can't do on-device speech recognition, so the wake word stays off for privacy."); return }

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        req.requiresOnDeviceRecognition = true
        request = req

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { fail("No microphone input found."); return }
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }
        engine.prepare()
        do { try engine.start() } catch {
            input.removeTap(onBus: 0)
            fail("Microphone could not start for the wake word.")
            return
        }

        generation += 1
        let gen = generation
        emit(["event": "wake_listening"])
        task = rec.recognitionTask(with: req) { [weak self] result, error in
            DispatchQueue.main.async {
                guard let self, self.running, gen == self.generation else { return }
                if let result {
                    let text = result.bestTranscription.formattedString
                    let range = NSRange(location: 0, length: (text as NSString).length)
                    if let re = self.pattern, re.firstMatch(in: text, options: [], range: range) != nil {
                        self.stop()
                        emit(["event": "wake"])
                        return
                    }
                    if result.isFinal { self.cycle(); return }
                }
                if error != nil { self.cycle() }
            }
        }
        // Recognition sessions are time-limited, so start a fresh one every 50 seconds.
        let work = DispatchWorkItem { [weak self] in self?.cycle() }
        restartWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 50, execute: work)
    }

    private func cycle() {
        guard running else { return }
        teardown()
        generation += 1
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            guard let self, self.running else { return }
            self.begin()
        }
    }

    private func teardown() {
        restartWork?.cancel()
        restartWork = nil
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
    }
}

// MARK: - Apple Foundation Models

func fmAvailability() -> String {
    #if canImport(FoundationModels)
    if #available(macOS 26.0, *) {
        if case .unavailable(let reason) = SystemLanguageModel.default.availability { return "\(reason)" }
        return "available"
    }
    return "requires macOS 26"
    #else
    return "SDK without FoundationModels (update Xcode Command Line Tools)"
    #endif
}

func runFM(id: String, system: String, prompt: String) {
    #if canImport(FoundationModels)
    if #available(macOS 26.0, *) {
        let status = fmAvailability()
        guard status == "available" else {
            emit(["event": "error", "id": id, "error": "Apple Intelligence model unavailable: \(status)"])
            return
        }
        Task {
            do {
                // System prompt is folded into the prompt to stay compatible across SDK revisions.
                let session = LanguageModelSession()
                let full = system.isEmpty ? prompt : "INSTRUCTIONS:\n\(system)\n\nCONVERSATION:\n\(prompt)"
                let response = try await session.respond(to: full)
                emit(["event": "fm", "id": id, "text": response.content])
            } catch {
                emit(["event": "error", "id": id, "error": "Apple Foundation Models: \(error.localizedDescription)"])
            }
        }
        return
    }
    #endif
    emit(["event": "error", "id": id, "error": "Apple Foundation Models: \(fmAvailability())"])
}

// MARK: - Apple Calendar & Reminders (EventKit)

let eventStore = EKEventStore()

func ekAccess(_ type: EKEntityType, _ done: @escaping (String?) -> Void) {
    let finish: (Bool, Error?) -> Void = { granted, error in
        DispatchQueue.main.async {
            if granted { done(nil) }
            else {
                let what = type == .event ? "Calendars" : "Reminders"
                done(error?.localizedDescription ?? "\(what) access is off. Turn it on in System Settings → Privacy & Security → \(what).")
            }
        }
    }
    if #available(macOS 14.0, *) {
        if type == .event { eventStore.requestFullAccessToEvents(completion: finish) }
        else { eventStore.requestFullAccessToReminders(completion: finish) }
    } else {
        eventStore.requestAccess(to: type, completion: finish)
    }
}

func ts(_ d: Date?) -> Any {
    if let d { return d.timeIntervalSince1970 }
    return NSNull()
}
func num(_ v: Any?) -> Double? { (v as? NSNumber)?.doubleValue }

func dateArg(_ v: Any?, _ fallback: Date) -> Date {
    if let n = num(v) { return Date(timeIntervalSince1970: n) }
    return fallback
}
func dueDate(_ r: EKReminder) -> Date? {
    guard let comps = r.dueDateComponents else { return nil }
    return Calendar.current.date(from: comps)
}

func calList(id: String, msg: [String: Any]) {
    let start: Date = dateArg(msg["start"], Date())
    let end: Date = dateArg(msg["end"], start.addingTimeInterval(7 * 86400))
    let pred = eventStore.predicateForEvents(withStart: start, end: end, calendars: nil)
    let found: [EKEvent] = eventStore.events(matching: pred)
    let sorted: [EKEvent] = found.sorted { (a: EKEvent, b: EKEvent) -> Bool in
        (a.startDate ?? Date.distantPast) < (b.startDate ?? Date.distantPast)
    }
    var out: [[String: Any]] = []
    for e in sorted.prefix(100) {
        var row: [String: Any] = [:]
        row["title"] = e.title ?? ""
        row["start"] = ts(e.startDate)
        row["end"] = ts(e.endDate)
        row["allDay"] = e.isAllDay
        row["location"] = e.location ?? ""
        row["calendar"] = e.calendar?.title ?? ""
        row["notes"] = String((e.notes ?? "").prefix(300))
        out.append(row)
    }
    emit(["event": "result", "id": id, "data": out])
}

func calCreate(id: String, msg: [String: Any]) {
    let ev = EKEvent(eventStore: eventStore)
    let start: Date = dateArg(msg["start"], Date())
    ev.title = (msg["title"] as? String) ?? "New event"
    ev.startDate = start
    ev.endDate = dateArg(msg["end"], start.addingTimeInterval(3600))
    ev.isAllDay = (msg["allDay"] as? Bool) ?? false
    if let loc = msg["location"] as? String, !loc.isEmpty { ev.location = loc }
    if let notes = msg["notes"] as? String, !notes.isEmpty { ev.notes = notes }
    ev.calendar = eventStore.defaultCalendarForNewEvents
    do {
        try eventStore.save(ev, span: .thisEvent, commit: true)
        var data: [String: Any] = [:]
        data["created"] = true
        data["title"] = ev.title ?? ""
        data["start"] = ts(ev.startDate)
        data["end"] = ts(ev.endDate)
        data["calendar"] = ev.calendar?.title ?? ""
        data["id"] = ev.eventIdentifier ?? ""   // v2.6 Rollback: lets Nexus undo it
        emit(["event": "result", "id": id, "data": data])
    } catch {
        emit(["event": "error", "id": id, "error": "Could not create event: \(error.localizedDescription)"])
    }
}

func remList(id: String) {
    let pred = eventStore.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: nil)
    _ = eventStore.fetchReminders(matching: pred) { (items: [EKReminder]?) in
        var out: [[String: Any]] = []
        for r in (items ?? []).prefix(100) {
            var row: [String: Any] = [:]
            row["title"] = r.title ?? ""
            row["due"] = ts(dueDate(r))
            row["list"] = r.calendar?.title ?? ""
            row["notes"] = String((r.notes ?? "").prefix(300))
            out.append(row)
        }
        emit(["event": "result", "id": id, "data": out])
    }
}

func remCreate(id: String, msg: [String: Any]) {
    let r = EKReminder(eventStore: eventStore)
    r.title = (msg["title"] as? String) ?? "Reminder"
    if let notes = msg["notes"] as? String, !notes.isEmpty { r.notes = notes }
    if let due = num(msg["due"]) {
        let d = Date(timeIntervalSince1970: due)
        r.dueDateComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: d)
        r.addAlarm(EKAlarm(absoluteDate: d))
    }
    r.calendar = eventStore.defaultCalendarForNewReminders()
    do {
        try eventStore.save(r, commit: true)
        var data: [String: Any] = [:]
        data["created"] = true
        data["title"] = r.title ?? ""
        data["due"] = ts(dueDate(r))
        data["list"] = r.calendar?.title ?? ""
        data["id"] = r.calendarItemIdentifier   // v2.6 Rollback: lets Nexus undo it
        emit(["event": "result", "id": id, "data": data])
    } catch {
        emit(["event": "error", "id": id, "error": "Could not create reminder: \(error.localizedDescription)"])
    }
}

// v2.6 Rollback: undo an event or reminder Nexus created
func calDelete(id: String, msg: [String: Any]) {
    guard let eid = msg["eventId"] as? String, !eid.isEmpty, let ev = eventStore.event(withIdentifier: eid) else {
        emit(["event": "result", "id": id, "data": ["deleted": false, "gone": true]]); return
    }
    do { try eventStore.remove(ev, span: .thisEvent, commit: true); emit(["event": "result", "id": id, "data": ["deleted": true]]) }
    catch { emit(["event": "error", "id": id, "error": "Could not remove event: \(error.localizedDescription)"]) }
}
func remDelete(id: String, msg: [String: Any]) {
    guard let rid = msg["itemId"] as? String, !rid.isEmpty, let r = eventStore.calendarItem(withIdentifier: rid) as? EKReminder else {
        emit(["event": "result", "id": id, "data": ["deleted": false, "gone": true]]); return
    }
    do { try eventStore.remove(r, commit: true); emit(["event": "result", "id": id, "data": ["deleted": true]]) }
    catch { emit(["event": "error", "id": id, "error": "Could not remove reminder: \(error.localizedDescription)"]) }
}

func runEventKit(cmd: String, id: String, msg: [String: Any]) {
    let type: EKEntityType = cmd.hasPrefix("cal") ? .event : .reminder
    ekAccess(type) { (err: String?) in
        if let err {
            emit(["event": "error", "id": id, "error": err])
            return
        }
        switch cmd {
        case "cal_list": calList(id: id, msg: msg)
        case "cal_create": calCreate(id: id, msg: msg)
        case "rem_list": remList(id: id)
        case "rem_create": remCreate(id: id, msg: msg)
        case "cal_delete": calDelete(id: id, msg: msg)
        case "rem_delete": remDelete(id: id, msg: msg)
        default: emit(["event": "error", "id": id, "error": "unknown EventKit command"])
        }
    }
}

// MARK: - Screen awareness + documents

func frontWindow(id: String, exclude: [Int]) {
    let skip = Set(exclude)
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    guard let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
        emit(["event": "result", "id": id, "data": NSNull()])
        return
    }
    for w in list {
        let layer = (w[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
        let pid = (w[kCGWindowOwnerPID as String] as? NSNumber)?.intValue ?? 0
        let alpha = (w[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1.0
        if layer != 0 || alpha <= 0.0 || skip.contains(pid) { continue }
        let bounds = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
        let width = (bounds["Width"] as? NSNumber)?.doubleValue ?? 0.0
        let height = (bounds["Height"] as? NSNumber)?.doubleValue ?? 0.0
        if width < 80.0 || height < 60.0 { continue }
        let owner = w[kCGWindowOwnerName as String] as? String ?? ""
        let title = w[kCGWindowName as String] as? String ?? ""
        let number = (w[kCGWindowNumber as String] as? NSNumber)?.intValue ?? 0
        var app = owner
        if let running = NSRunningApplication(processIdentifier: pid_t(pid)), let name = running.localizedName { app = name }
        let data: [String: Any] = ["windowId": number, "app": app, "title": title, "pid": pid, "width": width, "height": height]
        emit(["event": "result", "id": id, "data": data])
        return
    }
    emit(["event": "result", "id": id, "data": NSNull()])
}

func ocrImage(id: String, path: String) {
    DispatchQueue.global(qos: .userInitiated).async {
        guard let image = NSImage(contentsOfFile: path),
              let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            emit(["event": "error", "id": id, "error": "Couldn't open the image to read its text."])
            return
        }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        let handler = VNImageRequestHandler(cgImage: cg, options: [:])
        do {
            try handler.perform([request])
            let found: [VNRecognizedTextObservation] = request.results ?? []
            let ordered = found.sorted { (a: VNRecognizedTextObservation, b: VNRecognizedTextObservation) -> Bool in
                let dy = a.boundingBox.midY - b.boundingBox.midY
                if abs(dy) > 0.012 { return dy > 0 }
                return a.boundingBox.minX < b.boundingBox.minX
            }
            var lines: [String] = []
            for o in ordered {
                if let top = o.topCandidates(1).first { lines.append(top.string) }
            }
            let data: [String: Any] = ["text": lines.joined(separator: "\n")]
            emit(["event": "result", "id": id, "data": data])
        } catch {
            emit(["event": "error", "id": id, "error": "Text recognition failed: \(error.localizedDescription)"])
        }
    }
}

func pdfText(id: String, path: String) {
    DispatchQueue.global(qos: .userInitiated).async {
        guard let doc = PDFDocument(url: URL(fileURLWithPath: path)) else {
            emit(["event": "error", "id": id, "error": "Couldn't open the PDF."])
            return
        }
        var out = ""
        let count = doc.pageCount
        var i = 0
        while i < count && i < 300 && out.count < 250000 {
            if let page = doc.page(at: i), let text = page.string { out += text + "\n\n" }
            i += 1
        }
        let data: [String: Any] = ["text": out, "pages": count]
        emit(["event": "result", "id": id, "data": data])
    }
}

// MARK: - Accessibility: selected text

func axTrusted(prompt: Bool) -> Bool {
    let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
    let options = [key: prompt] as CFDictionary
    return AXIsProcessTrustedWithOptions(options)
}

// Copy the selection with ⌘C, read it, then put the user's clipboard back the way it was.
func copySelection() -> String {
    let pb = NSPasteboard.general
    var saved: [[String: Data]] = []
    for item in pb.pasteboardItems ?? [] {
        var d: [String: Data] = [:]
        for t in item.types {
            if let v = item.data(forType: t) { d[t.rawValue] = v }
        }
        saved.append(d)
    }
    let before = pb.changeCount
    let source = CGEventSource(stateID: .combinedSessionState)
    let down = CGEvent(keyboardEventSource: source, virtualKey: 0x08, keyDown: true)
    let up = CGEvent(keyboardEventSource: source, virtualKey: 0x08, keyDown: false)
    down?.flags = .maskCommand
    up?.flags = .maskCommand
    down?.post(tap: .cghidEventTap)
    up?.post(tap: .cghidEventTap)
    var waited = 0
    while pb.changeCount == before && waited < 50 {
        usleep(10000)
        waited += 1
    }
    if pb.changeCount == before { return "" }
    let text = pb.string(forType: .string) ?? ""
    pb.clearContents()
    var items: [NSPasteboardItem] = []
    for d in saved {
        let it = NSPasteboardItem()
        for (t, v) in d { it.setData(v, forType: NSPasteboard.PasteboardType(t)) }
        items.append(it)
    }
    if !items.isEmpty { pb.writeObjects(items) }
    return text
}

func selectedText(id: String, allowCopy: Bool) {
    if !axTrusted(prompt: false) {
        emit(["event": "error", "id": id, "error": "AX_DENIED"])
        return
    }
    let front = NSWorkspace.shared.frontmostApplication
    let appName = front?.localizedName ?? ""
    DispatchQueue.global(qos: .userInitiated).async {
        var text = ""
        var method = "ax"
        if let pid = front?.processIdentifier {
            let axApp = AXUIElementCreateApplication(pid)
            var focused: CFTypeRef?
            if AXUIElementCopyAttributeValue(axApp, kAXFocusedUIElementAttribute as CFString, &focused) == .success, let f = focused {
                let element = f as! AXUIElement
                var sel: CFTypeRef?
                if AXUIElementCopyAttributeValue(element, kAXSelectedTextAttribute as CFString, &sel) == .success, let s = sel as? String {
                    text = s
                }
            }
        }
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && allowCopy {
            text = copySelection()
            method = "copy"
        }
        let data: [String: Any] = ["text": text, "app": appName, "method": method]
        emit(["event": "result", "id": id, "data": data])
    }
}

// MARK: - Highlight watcher (v2.7.1): highlight text in any app → Nexus shows its orb next to it.
// Read-only: it listens for mouse-ups that end a drag, a double/triple-click or a shift-click, then asks the
// focused element for its selected text through Accessibility. It never presses ⌘C, never touches the
// clipboard, never reads password fields and ignores Nexus itself. Mouse events only, no keystrokes.

// The focused element's highlighted text, or nil (nothing selected, a password field, or the app won't say).
func selectedTextOf(_ axApp: AXUIElement) -> String? {
    var focused: CFTypeRef?
    guard AXUIElementCopyAttributeValue(axApp, kAXFocusedUIElementAttribute as CFString, &focused) == .success,
          let f = focused, CFGetTypeID(f) == AXUIElementGetTypeID() else { return nil }
    let element = f as! AXUIElement
    var role: CFTypeRef?
    var subrole: CFTypeRef?
    _ = AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &role)
    _ = AXUIElementCopyAttributeValue(element, kAXSubroleAttribute as CFString, &subrole)
    if (role as? String) == "AXSecureTextField" || (subrole as? String) == "AXSecureTextField" { return nil }
    var sel: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXSelectedTextAttribute as CFString, &sel) == .success,
          let text = sel as? String else { return nil }
    return text.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 ? text : nil
}

final class SelectionWatcher {
    private var tap: CFMachPort?
    private var source: CFRunLoopSource?
    private var downAt = CGPoint.zero
    private var ownPid: pid_t = 0
    private var seq = 0
    private var showing = false
    private var primed = Set<pid_t>()
    private let queue = DispatchQueue(label: "nexuscore.selection")

    func start(ownPid: Int) {
        self.ownPid = pid_t(ownPid)
        if tap != nil { emit(["event": "sel_watch", "ok": true]); return }
        if !axTrusted(prompt: false) { emit(["event": "sel_watch", "ok": false, "error": "AX_DENIED"]); return }
        let mask: CGEventMask = (CGEventMask(1) << CGEventMask(CGEventType.leftMouseDown.rawValue))
            | (CGEventMask(1) << CGEventMask(CGEventType.leftMouseUp.rawValue))
        guard let t = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .tailAppendEventTap, options: .listenOnly,
                                        eventsOfInterest: mask, callback: selectionTapCallback, userInfo: nil) else {
            emit(["event": "sel_watch", "ok": false, "error": "TAP_FAILED"])
            return
        }
        tap = t
        let src = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, t, 0)
        source = src
        CFRunLoopAddSource(CFRunLoopGetMain(), src, .commonModes)
        CGEvent.tapEnable(tap: t, enable: true)
        emit(["event": "sel_watch", "ok": true])
    }

    func stop() {
        if let t = tap { CGEvent.tapEnable(tap: t, enable: false); CFMachPortInvalidate(t) }
        if let s = source { CFRunLoopRemoveSource(CFRunLoopGetMain(), s, .commonModes) }
        tap = nil
        source = nil
        seq += 1
        showing = false
    }

    func reenable() {
        if let t = tap { CGEvent.tapEnable(tap: t, enable: true) }
    }

    func handle(type: CGEventType, event: CGEvent) {
        let p = event.location
        if type == .leftMouseDown {
            downAt = p
            seq += 1
            if showing { showing = false; emit(["event": "sel_clear", "x": Double(p.x), "y": Double(p.y)]) }
            return
        }
        guard type == .leftMouseUp else { return }
        let dx = Double(p.x - downAt.x), dy = Double(p.y - downAt.y)
        let dragged = dx * dx + dy * dy > 36
        let clicks = event.getIntegerValueField(.mouseEventClickState)
        let shift = event.flags.contains(.maskShift)
        guard dragged || clicks >= 2 || shift else { return }
        seq += 1
        let mine = seq
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { self.read(mine, at: p) }
    }

    private func read(_ mine: Int, at p: CGPoint) {
        guard mine == seq, let front = NSWorkspace.shared.frontmostApplication, front.processIdentifier != ownPid else { return }
        let pid = front.processIdentifier
        let name = front.localizedName ?? ""
        let bundle = front.bundleIdentifier ?? ""
        let firstTime = !primed.contains(pid)
        primed.insert(pid)
        queue.async {
            let axApp = AXUIElementCreateApplication(pid)
            _ = AXUIElementSetMessagingTimeout(axApp, 0.3)
            // Chrome, Electron apps and friends only share their text once something asks for it
            if firstTime { _ = AXUIElementSetAttributeValue(axApp, "AXManualAccessibility" as CFString, kCFBooleanTrue) }
            var text = selectedTextOf(axApp)
            if text == nil && firstTime { usleep(150000); text = selectedTextOf(axApp) }
            guard let found = text else { return }
            DispatchQueue.main.async {
                guard mine == self.seq else { return }
                self.showing = true
                emit(["event": "selection", "text": String(found.prefix(20000)), "app": name, "bundle": bundle, "x": Double(p.x), "y": Double(p.y)])
            }
        }
    }
}

let selWatcher = SelectionWatcher()

func selectionTapCallback(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent, refcon: UnsafeMutableRawPointer?) -> Unmanaged<CGEvent>? {
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        selWatcher.reenable()
    } else {
        selWatcher.handle(type: type, event: event)
    }
    return Unmanaged.passUnretained(event)
}

// MARK: - Transcribe an audio file (v2.1: Meeting notes). On-device when the Mac supports it.

final class FileTranscriber {
    private var tasks: [String: SFSpeechRecognitionTask] = [:]

    func run(id: String, path: String, locale: String?) {
        SFSpeechRecognizer.requestAuthorization { status in
            DispatchQueue.main.async {
                guard status == .authorized else {
                    emit(["event": "error", "id": id, "error": "Speech Recognition permission is off. Turn it on in System Settings → Privacy & Security → Speech Recognition, or add an OpenAI key for speech-to-text."])
                    return
                }
                var recognizer: SFSpeechRecognizer? = nil
                if let locale, !locale.isEmpty { recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)) }
                if recognizer == nil { recognizer = SFSpeechRecognizer() }
                guard let rec = recognizer, rec.isAvailable else {
                    emit(["event": "error", "id": id, "error": "Speech recognition isn't available right now."])
                    return
                }
                let req = SFSpeechURLRecognitionRequest(url: URL(fileURLWithPath: path))
                req.shouldReportPartialResults = false
                if rec.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
                if #available(macOS 13.0, *) { req.addsPunctuation = true }
                self.tasks[id] = rec.recognitionTask(with: req) { [weak self] result, error in
                    DispatchQueue.main.async {
                        if let result, result.isFinal {
                            self?.tasks[id] = nil
                            emit(["event": "result", "id": id, "data": ["text": result.bestTranscription.formattedString]])
                        } else if let error {
                            self?.tasks[id] = nil
                            let code = (error as NSError).code
                            if code == 1110 || code == 203 || code == 301 {
                                emit(["event": "result", "id": id, "data": ["text": ""]])   // no speech in this stretch
                            } else {
                                emit(["event": "error", "id": id, "error": "Transcription failed: \(error.localizedDescription)"])
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Main loop

@main
struct NexusCore {
    static let listener = Listener()
    static let wake = WakeWord()
    static let files = FileTranscriber()

    static func handle(_ line: String) {
        guard let data = line.data(using: .utf8),
              let msg = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let cmd = msg["cmd"] as? String else { return }
        let id = msg["id"] as? String ?? ""
        switch cmd {
        case "info":
            emit(["event": "info", "id": id, "version": 7, "stt": true, "eventkit": true, "wake": true, "screen": true, "ax": true, "transcribeFile": true, "selwatch": true, "fm": fmAvailability()])
        case "listen":
            wake.stop()
            listener.start(id: id, locale: msg["locale"] as? String)
        case "wake_start":
            wake.start()
        case "wake_stop":
            wake.stop()
        case "stop":
            listener.stop(id: id)
        case "cancel":
            listener.cancel()
        case "cal_list", "cal_create", "rem_list", "rem_create", "cal_delete", "rem_delete":
            runEventKit(cmd: cmd, id: id, msg: msg)
        case "front_window":
            let ex = (msg["exclude"] as? [Any] ?? []).compactMap { ($0 as? NSNumber)?.intValue }
            frontWindow(id: id, exclude: ex)
        case "ocr":
            ocrImage(id: id, path: msg["path"] as? String ?? "")
        case "pdf_text":
            pdfText(id: id, path: msg["path"] as? String ?? "")
        case "ax_status":
            let trusted = axTrusted(prompt: (msg["prompt"] as? Bool) ?? false)
            emit(["event": "result", "id": id, "data": ["trusted": trusted]])
        case "selected_text":
            selectedText(id: id, allowCopy: (msg["copy"] as? Bool) ?? true)
        case "sel_watch_start":
            selWatcher.start(ownPid: (msg["pid"] as? NSNumber)?.intValue ?? 0)
        case "sel_watch_stop":
            selWatcher.stop()
        case "transcribe_file":
            files.run(id: id, path: msg["path"] as? String ?? "", locale: msg["locale"] as? String)
        case "fm":
            runFM(id: id, system: msg["system"] as? String ?? "", prompt: msg["prompt"] as? String ?? "")
        default:
            emit(["event": "error", "id": id, "error": "unknown command \(cmd)"])
        }
    }

    static func main() {
        setvbuf(stdout, nil, _IONBF, 0)
        Thread.detachNewThread {
            while let line = readLine(strippingNewline: true) {
                DispatchQueue.main.async { handle(line) }
            }
            exit(0) // parent closed stdin → quit
        }
        emit(["event": "ready"])
        RunLoop.main.run()
    }
}
