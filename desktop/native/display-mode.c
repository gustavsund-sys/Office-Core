#include <ApplicationServices/ApplicationServices.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

int main(int argc, char **argv) {
    CGDirectDisplayID display = argc > 1 ? (CGDirectDisplayID)strtoul(argv[1], NULL, 10) : CGMainDisplayID();
    if (!display) display = CGMainDisplayID();
    CGDisplayModeRef original = CGDisplayCopyDisplayMode(display);
    CFArrayRef modes = CGDisplayCopyAllDisplayModes(display, NULL);
    if (!original || !modes) { puts("ERROR: Cannot read display modes"); return 1; }
    if (argc > 2 && !strcmp(argv[2], "--current")) {
        printf("%zux%zu pixels=%zux%zu\n", CGDisplayModeGetWidth(original), CGDisplayModeGetHeight(original), CGDisplayModeGetPixelWidth(original), CGDisplayModeGetPixelHeight(original));
        return 0;
    }
    CGDisplayModeRef target = NULL;
    for (CFIndex i = 0; i < CFArrayGetCount(modes); i++) {
        CGDisplayModeRef mode = (CGDisplayModeRef)CFArrayGetValueAtIndex(modes, i);
        if (argc > 2 && !strcmp(argv[2], "--list")) {
            printf("%zux%zu pixels=%zux%zu hz=%.2f\n", CGDisplayModeGetWidth(mode), CGDisplayModeGetHeight(mode), CGDisplayModeGetPixelWidth(mode), CGDisplayModeGetPixelHeight(mode), CGDisplayModeGetRefreshRate(mode));
        }
        if (CGDisplayModeGetWidth(mode) != 1920 || CGDisplayModeGetHeight(mode) != 1080 || CGDisplayModeGetPixelWidth(mode) != 1920 || CGDisplayModeGetPixelHeight(mode) != 1080) continue;
        if (!target || fabs(CGDisplayModeGetRefreshRate(mode) - CGDisplayModeGetRefreshRate(original)) < fabs(CGDisplayModeGetRefreshRate(target) - CGDisplayModeGetRefreshRate(original))) target = mode;
    }
    if (argc > 2 && !strcmp(argv[2], "--list")) return 0;
    if (!target) { puts("ERROR: Display does not support 1920x1080"); return 1; }
    if (CGDisplaySetDisplayMode(display, target, NULL) != kCGErrorSuccess) { puts("ERROR: Display rejected 1920x1080"); return 1; }
    puts("READY"); fflush(stdout);
    // EOF restores the mode even when the parent Electron process crashes.
    getchar();
    CGError result = CGDisplaySetDisplayMode(display, original, NULL);
    CFRelease(modes); CGDisplayModeRelease(original);
    return result == kCGErrorSuccess ? 0 : 1;
}
