# Builds the «web-version» folder: a clean copy of the karaoke to upload to a static host
# (Netlify, Cloudflare Pages, GitHub Pages...). It contains only what is needed to use it:
#   index.html, css/, js/  the app: the page, the styles and the JavaScript modules (voice engine included)
#   data/                  the recorded consonants (consonant-samples.json) and their license
#   songs/<folder>/        the UltraStar .txt and the audio of each song, with URL-friendly names
#   songs/list.js          the song list (with each folder's original name for display)
#   robots.txt             so search engines do not index it
#   CREDITS.txt            licenses that must accompany the publication
# Run by «Build web version.bat». Works with Windows PowerShell 5.1 and with PowerShell 7.
# The «web-version» folder is deleted and rebuilt every time.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$songs = Join-Path $root 'songs'
$out = Join-Path $root 'web-version'
$audioExt = '^\.(mp3|ogg|oga|opus|m4a|aac|wav|flac|webm|weba)$'
$videoExt = '^\.(mp4|m4v|webm)$'
$imageExt = '^\.(jpe?g|png|webp|gif)$'
$backing = 'karaoke|instrumental|backing|pista|sin voz|playback'

function Js([string]$s) {
  '"' + ($s -replace '\\', '\\' -replace '"', '\"' -replace "`r", '\r' -replace "`n", '\n' -replace '<', '<') + '"'
}
# URL-friendly name: «Himno Nacional Argentino versión karaoke en Sol#M» -> «himno-nacional-argentino-version-karaoke-en-sol-m»
function Slug([string]$s, [string]$fallback) {
  $n = $s.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object Text.StringBuilder
  foreach ($ch in $n.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) { [void]$sb.Append($ch) }
  }
  $t = ($sb.ToString().ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
  if ($t.Length -gt 60) { $t = $t.Substring(0, 60).Trim('-') }
  if (-not $t) { $t = $fallback }
  $t
}
# Name not used yet in this folder: adds -2, -3... if needed
function Unique([string]$name, $used) {
  $stem = [IO.Path]::GetFileNameWithoutExtension($name); $ext = [IO.Path]::GetExtension($name)
  $cand = $name; $i = 2
  while ($used.Contains($cand)) { $cand = "$stem-$i$ext"; $i++ }
  [void]$used.Add($cand); $cand
}

$app = @('index.html', 'css', 'js', 'data')
foreach ($a in $app) { if (-not (Test-Path -LiteralPath (Join-Path $root $a))) { throw "$a not found next to the tools folder." } }
if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $out 'songs') | Out-Null
# The app as is: the page, the styles, the modules and the data (a static host serves them unchanged)
foreach ($a in $app) { Copy-Item -LiteralPath (Join-Path $root $a) -Destination (Join-Path $out $a) -Recurse }

$items = New-Object System.Collections.Generic.List[string]
$usedDirs = New-Object System.Collections.Generic.HashSet[string]
$total = (Get-ChildItem -LiteralPath $out -Recurse -File | Measure-Object -Property Length -Sum).Sum
$warnings = New-Object System.Collections.Generic.List[string]
$dirs = @()
if (Test-Path -LiteralPath $songs) { $dirs = @(Get-ChildItem -LiteralPath $songs -Directory | Sort-Object Name) }
foreach ($d in $dirs) {
  $files = @(Get-ChildItem -LiteralPath $d.FullName -File | Sort-Object Name)
  $txts = @($files | Where-Object { $_.Extension -ieq '.txt' -and $_.Length -lt 1MB })
  if ($txts.Count -eq 0) { continue }
  # audio: if there is a karaoke or instrumental version, only that one (the version with vocals is not published)
  $audios = @($files | Where-Object { $_.Extension -match $audioExt })
  $bk = @($audios | Where-Object { $_.BaseName -match $backing })
  if ($bk.Count -gt 0) { $audios = $bk }
  if ($audios.Count -eq 0) { $audios = @($files | Where-Object { $_.Extension -match $videoExt } | Select-Object -First 1) }
  $images = @($files | Where-Object { $_.Extension -match $imageExt -and $_.Length -lt 2MB } | Select-Object -First 1)

  $slug = Unique (Slug $d.Name 'song') $usedDirs
  $dest = Join-Path (Join-Path $out 'songs') $slug
  New-Item -ItemType Directory -Path $dest | Out-Null
  $usedFiles = New-Object System.Collections.Generic.HashSet[string]
  $names = New-Object System.Collections.Generic.List[string]
  $txtJs = New-Object System.Collections.Generic.List[string]
  foreach ($f in @($txts + $audios + $images)) {
    if ($null -eq $f) { continue }
    $n = Unique ((Slug $f.BaseName 'file') + $f.Extension.ToLowerInvariant()) $usedFiles
    Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $dest $n)
    $names.Add((Js $n)); $total += $f.Length
    if ($f.Extension -ieq '.txt') { $txtJs.Add((Js $n) + ':' + (Js ([Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName))))) }
    if ($f.Length -gt 25MB) { $warnings.Add("$($d.Name)\$($f.Name) is larger than 25 MB: Cloudflare Pages does not accept it (convert it to a 192 kbps mp3).") }
    elseif ($f.Length -gt 10MB) { $warnings.Add("$($d.Name)\$($f.Name) is larger than 10 MB: with Netlify Drop it is better to upload it from the command line or shrink it.") }
  }
  $items.Add('{"folder":' + (Js $slug) + ',"name":' + (Js $d.Name) + ',"files":[' + ($names -join ',') + '],"txt":{' + ($txtJs -join ',') + '}}')
  Write-Host ("  {0}  ->  songs/{1}" -f $d.Name, $slug)
}
$utf8 = New-Object System.Text.UTF8Encoding $false
$js = "// Generated by tools/build-web.ps1 on $(Get-Date -Format s).`n" +
      'window.KARAOKE_SONGS = {"folders":[' + "`n" + ($items -join ",`n") + "`n]};`n"
[IO.File]::WriteAllText((Join-Path $out 'songs\list.js'), $js, $utf8)
[IO.File]::WriteAllText((Join-Path $out 'robots.txt'), "User-agent: *`nDisallow: /`n", $utf8)

$credits = @'
Cara-o-que - web version

Credits and licenses
- Voice model: L. Feugère, C. d'Alessandro, B. Doval and O. Perrotin, «Cantor Digitalis: chironomic parametric
  synthesis of singing», EURASIP Journal on Audio, Speech, and Music Processing 2017:2.
- The engine adapts the Web Audio implementation by Edward Browncross
  (https://github.com/edwardbrowncross/cantor-digitalis), under this license:

  ISC License. Copyright (c) 2026 Edward Browncross. Permission to use, copy, modify, and/or distribute this
  software for any purpose with or without fee is hereby granted, provided that the above copyright notice and
  this permission notice appear in all copies. THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL
  WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO
  EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
  WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
  TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
- MediaPipe Face Landmarker (Google): Apache 2.0. Downloaded from jsDelivr and Google when the page opens.
- Recorded consonants (data/consonant-samples.json): fragments of OpenSLR 61, A. Guevara-Rukoz et al.,
  «Crowdsourced Latin American Spanish for Low-Resource Text-to-Speech», Proc. LREC 2020.
  License CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/); the fragments are shared under the
  same license.
- English pronunciation: CMU Pronouncing Dictionary (Carnegie Mellon University), npm package
  «cmu-pronouncing-dictionary» (ISC license); downloaded from jsDelivr when an English song is chosen.
- English vowels: J. Hillenbrand, L. Getty, M. Clark and K. Wheeler, «Acoustic characteristics of American English
  vowels», JASA 97(5), 1995.
- The songs in the «songs» folder belong to their authors and are included for testing only.

The camera image is processed in each person's browser; it is not sent to any server.
'@
[IO.File]::WriteAllText((Join-Path $out 'CREDITS.txt'), $credits.Replace("`r`n", "`n"), (New-Object System.Text.UTF8Encoding $true))

Write-Host ''
Write-Host ("Web version ready in {0}: {1} song(s), {2:N1} MB in total." -f $out, $items.Count, ($total / 1MB))
foreach ($a in $warnings) { Write-Host "Warning: $a" }
Write-Host 'To publish it, upload that whole folder (see «Publishing online» in the README).'
