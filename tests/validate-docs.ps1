$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$documentPath = Join-Path $projectRoot 'product-design.md'
$strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)
$document = $strictUtf8.GetString([System.IO.File]::ReadAllBytes($documentPath))
$lines = $document -split '\r?\n'
$headings = @($lines | Where-Object { $_ -match '^#{1,6} ' })

if ($headings.Count -eq 0 -or @($headings | Where-Object { $_ -match '^# ' }).Count -ne 1) {
    throw 'The document must have exactly one top-level heading.'
}
if ($document.Contains([char]0xFFFD)) {
    throw 'The document contains a Unicode replacement character.'
}
if ($document -match '(?m)^(<<<<<<< |=======\s*$|>>>>>>> )') {
    throw 'The document contains unresolved merge conflict markers.'
}

$previousLevel = 0
$headingNames = [System.Collections.Generic.HashSet[string]]::new()
foreach ($heading in $headings) {
    $level = [regex]::Match($heading, '^#+').Length
    if ($level -gt $previousLevel + 1) {
        throw "Skipped heading level: $heading"
    }
    if (-not $headingNames.Add($heading)) {
        throw "Duplicate heading: $heading"
    }
    $previousLevel = $level
}

$tableRows = @($lines | Where-Object { $_ -match '^\|' })
if ($tableRows.Count -lt 3) {
    throw 'The feature table must have a header, separator, and content rows.'
}
$columnCount = ($tableRows[0] -split '\|').Count
foreach ($row in $tableRows) {
    if (($row -split '\|').Count -ne $columnCount) {
        throw "Inconsistent feature table columns: $row"
    }
}

Write-Output "PASS: UTF-8, conflict markers, heading hierarchy, unique headings, feature table ($($headings.Count) headings)."
