param([int]$Width = 1920, [int]$Height = 1080)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class DisplayMode {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Mode {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string device;
    public short spec, driver, size, extra;
    public uint fields;
    public int x, y;
    public uint orientation, fixedOutput;
    public short color, duplex, yResolution, ttOption, collate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string form;
    public short logPixels;
    public uint bits, width, height, flags, frequency, icmMethod, icmIntent, media, dither, reserved1, reserved2, panningWidth, panningHeight;
  }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool EnumDisplaySettings(string device, int index, ref Mode mode);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int ChangeDisplaySettings(ref Mode mode, uint flags);
  public static Mode Read(int index) {
    Mode m = new Mode(); m.size = (short)Marshal.SizeOf(typeof(Mode));
    if (!EnumDisplaySettings(null, index, ref m)) throw new Exception("No display mode");
    return m;
  }
}
'@
$original = [DisplayMode]::Read(-1)
$target = $null
for ($i = 0; ; $i++) {
  try { $candidate = [DisplayMode]::Read($i) } catch { break }
  if ($candidate.width -eq $Width -and $candidate.height -eq $Height -and $candidate.bits -eq $original.bits) {
    if ($null -eq $target -or [Math]::Abs([double]$candidate.frequency - $original.frequency) -lt [Math]::Abs([double]$target.frequency - $original.frequency)) { $target = $candidate }
  }
}
if ($null -eq $target) { Write-Output "ERROR: Display does not support ${Width}x${Height}"; exit 1 }
try {
  if ([DisplayMode]::ChangeDisplaySettings([ref]$target, 4) -ne 0) { throw "Display rejected ${Width}x${Height}" }
  Write-Output 'READY'
  [Console]::Out.Flush()
  $null = [Console]::ReadLine()
} finally { $null = [DisplayMode]::ChangeDisplaySettings([ref]$original, 0) }
