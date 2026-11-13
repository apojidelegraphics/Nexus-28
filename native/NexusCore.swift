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
        emit(["event": "result", "id": id, "data": data])
    } catch {
        emit(["event": "error", "id": id, "error": "Could not create reminder: \(error.localizedDescription)"])
    }
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

// MARK: - Main loop

@main
struct NexusCore {
    static let listener = Listener()
    static let wake = WakeWord()

    static func handle(_ line: String) {
        guard let data = line.data(using: .utf8),
              let msg = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let cmd = msg["cmd"] as? String else { return }
        let id = msg["id"] as? String ?? ""
        switch cmd {
        case "info":
            emit(["event": "info", "id": id, "version": 5, "stt": true, "eventkit": true, "wake": true, "screen": true, "fm": fmAvailability()])
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
        case "cal_list", "cal_create", "rem_list", "rem_create":
            runEventKit(cmd: cmd, id: id, msg: msg)
        case "front_window":
            let ex = (msg["exclude"] as? [Any] ?? []).compactMap { ($0 as? NSNumber)?.intValue }
            frontWindow(id: id, exclude: ex)
        case "ocr":
            ocrImage(id: id, path: msg["path"] as? String ?? "")
        case "pdf_text":
            pdfText(id: id, path: msg["path"] as? String ?? "")
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
