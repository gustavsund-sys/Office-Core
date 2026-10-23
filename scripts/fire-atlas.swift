// Usage: swift scripts/fire-atlas.swift source.mov output.png
// Native ProRes/alpha decoding; original footage never goes into public/.
import Foundation
import AVFoundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func fail(_ message: String) -> Never { fputs(message + "\n", stderr); exit(1) }
let args = CommandLine.arguments
guard args.count == 3 || args.count == 4 else { fail("Usage: fire-atlas.swift source.mov output.png") }
let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let duration = CMTimeGetSeconds(asset.duration)
guard duration.isFinite && duration > 0.5 else { fail("Invalid or too-short footage") }
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.maximumSize = CGSize(width: 512, height: 512)
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero
let oneShot = args.count == 4 && args[3] == "oneshot"
let count = oneShot ? 64 : 48, overlap = oneShot ? 0 : 8, cell = 256, columns = 8
let span = oneShot ? min(4.0, duration - 0.05) : min(2.0, duration - 0.1)
let start = oneShot ? 0 : max(0, (duration - span) / 2)
var frames: [CGImage] = []
var bounds = CGRect.null
let space = CGColorSpaceCreateDeviceRGB()
for index in 0..<count {
    let time = CMTime(seconds: start + span * Double(index) / Double(count), preferredTimescale: 60000)
    let image: CGImage
    do { image = try generator.copyCGImage(at: time, actualTime: nil) }
    catch { fail("Could not decode frame \(index): \(error)") }
    frames.append(image)
    let w = image.width, h = image.height
    var bytes = [UInt8](repeating: 0, count: w * h * 4)
    var minX = w, minY = h, maxX = -1, maxY = -1
    bytes.withUnsafeMutableBytes { storage in
        guard let context = CGContext(data: storage.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return }
        context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        for y in 0..<h { for x in 0..<w {
            if storage[y * w * 4 + x * 4 + 3] > 10 {
                minX = min(minX, x); minY = min(minY, y); maxX = max(maxX, x); maxY = max(maxY, y)
            }
        }}
    }
    if maxX >= minX { bounds = bounds.union(CGRect(x: minX, y: minY, width: maxX-minX+1, height: maxY-minY+1)) }
}
guard !bounds.isNull else { fail("No visible alpha content") }
// Crop a fixed union across the sequence so flames do not wobble between frames.
let full = CGRect(x: 0, y: 0, width: frames[0].width, height: frames[0].height)
bounds = bounds.insetBy(dx: -4, dy: -4).intersection(full).integral
let outputFrames = count-overlap
let rows = Int(ceil(Double(outputFrames)/Double(columns)))
guard let atlas = CGContext(data: nil, width: columns*cell, height: rows*cell, bitsPerComponent: 8, bytesPerRow: columns*cell*4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fail("Cannot allocate atlas") }
atlas.interpolationQuality = .high
let scale = min(Double(cell-12)/bounds.width, Double(cell-12)/bounds.height)
let width = bounds.width*scale, height = bounds.height*scale
for output in 0..<outputFrames {
    let index = output+overlap
    let x = Double(output%columns*cell)+(Double(cell)-width)/2
    let y = Double((rows-1-output/columns)*cell)+(Double(cell)-height)/2
    let rect = CGRect(x:x,y:y,width:width,height:height)
    guard let first = frames[index].cropping(to: bounds) else { fail("Crop failed") }
    let blend = index >= count-overlap ? Double(index-(count-overlap)+1)/Double(overlap) : 0
    atlas.setAlpha(1-blend); atlas.draw(first,in:rect)
    if blend>0, let next = frames[index-(count-overlap)].cropping(to:bounds) { atlas.setAlpha(blend);atlas.draw(next,in:rect) }
}
atlas.setAlpha(1)
guard let image=atlas.makeImage(), let dest=CGImageDestinationCreateWithURL(URL(fileURLWithPath:args[2]) as CFURL,UTType.png.identifier as CFString,1,nil) else { fail("Cannot create output") }
CGImageDestinationAddImage(dest,image,nil)
guard CGImageDestinationFinalize(dest) else { fail("Cannot write output") }
print("{\"cellSize\":256,\"frames\":\(outputFrames),\"fps\":\(Double(count)/span),\"width\":\(columns*cell),\"height\":\(rows*cell)}")
