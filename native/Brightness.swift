// apoji-brightness — reads and sets the real backlight brightness of a Mac's displays.
// Shared by Nexus '28 and Apoji Admin (keep both copies the same). Used by the screen dimmer: when you step away it
// lowers the actual brightness instead of only laying a dark layer on top, and puts it back when you return.
//
// macOS has no public API for this. Like MonitorControl and Lunar, it uses Apple's private DisplayServices framework
// (loaded at run time, so if a future macOS removes it this tool just reports "not supported" and the app falls back
// to the dark layer). Built-in displays and Apple displays work; most third-party monitors don't.
//
//   apoji-brightness list                → [{"id":1,"builtin":true,"supported":true,"value":0.62}, …]
//   apoji-brightness get <id>            → {"id":1,"value":0.62}
//   apoji-brightness set <id> <0…1>      → {"id":1,"value":0.30}
//   apoji-brightness check               → like list, and also proves "set" works (sets each one to its own value)
import Foundation
import CoreGraphics

typealias GetFn = @convention(c) (CGDirectDisplayID, UnsafeMutablePointer<Float>) -> Int32
typealias SetFn = @convention(c) (CGDirectDisplayID, Float) -> Int32
typealias CanFn = @convention(c) (CGDirectDisplayID) -> Bool

let handle = dlopen("/System/Library/PrivateFrameworks/DisplayServices.framework/DisplayServices", RTLD_NOW)
func sym<T>(_ name: String, _ type: T.Type) -> T? {
  guard let h = handle, let p = dlsym(h, name) else { return nil }
  return unsafeBitCast(p, to: type)
}
let getB = sym("DisplayServicesGetBrightness", GetFn.self)
let setB = sym("DisplayServicesSetBrightness", SetFn.self)
let canB = sym("DisplayServicesCanChangeBrightness", CanFn.self)

func out(_ obj: Any) {
  if let d = try? JSONSerialization.data(withJSONObject: obj), let s = String(data: d, encoding: .utf8) { print(s) }
}
func fail(_ msg: String) -> Never { out(["error": msg]); exit(1) }

func displays() -> [CGDirectDisplayID] {
  var n: UInt32 = 0
  CGGetActiveDisplayList(0, nil, &n)
  var ids = [CGDirectDisplayID](repeating: 0, count: Int(n))
  CGGetActiveDisplayList(n, &ids, &n)
  return Array(ids.prefix(Int(n)))
}
func read(_ id: CGDirectDisplayID) -> Float? {
  guard let g = getB else { return nil }
  var v: Float = -1
  return g(id, &v) == 0 && v >= 0 && v <= 1 ? v : nil
}
func info(_ id: CGDirectDisplayID, prove: Bool) -> [String: Any] {
  let v = read(id)
  var ok = v != nil && (canB?(id) ?? true)
  if ok && prove, let s = setB, let cur = v { ok = s(id, cur) == 0 }
  var d: [String: Any] = ["id": Int(id), "builtin": CGDisplayIsBuiltin(id) != 0, "supported": ok]
  if let v = v { d["value"] = Double((v * 1000).rounded() / 1000) }
  return d
}

let args = CommandLine.arguments
guard args.count >= 2 else { fail("usage: apoji-brightness list | check | get <id> | set <id> <0..1>") }
if getB == nil || setB == nil { if args[1] == "list" || args[1] == "check" { out(displays().map { ["id": Int($0), "builtin": CGDisplayIsBuiltin($0) != 0, "supported": false] }); exit(0) }; fail("DisplayServices is not available on this Mac") }
switch args[1] {
case "list": out(displays().map { info($0, prove: false) })
case "check": out(displays().map { info($0, prove: true) })
case "get":
  guard args.count >= 3, let id = UInt32(args[2]) else { fail("get <id>") }
  guard let v = read(id) else { fail("can't read this display's brightness") }
  out(["id": Int(id), "value": Double(v)])
case "set":
  guard args.count >= 4, let id = UInt32(args[2]), let raw = Float(args[3]) else { fail("set <id> <0..1>") }
  let v = min(1, max(0, raw))
  guard setB!(id, v) == 0 else { fail("macOS refused to change this display's brightness") }
  out(["id": Int(id), "value": Double(v)])
default: fail("unknown command \(args[1])")
}
