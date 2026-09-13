$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$strictUtf8 = [System.Text.UTF8Encoding]::new($false, $true)

function Assert-MarkdownTable {
    param([string[]]$Rows, [string]$DocumentPath)
    if ($Rows.Count -eq 0) { return }
    if ($Rows.Count -lt 3) {
        throw "Table requires a header, separator and content: $DocumentPath"
    }
    $columnCount = ([regex]::Split($Rows[0].Trim().Trim('|'), '(?<!\\)\|')).Count
    foreach ($row in $Rows) {
        if (([regex]::Split($row.Trim().Trim('|'), '(?<!\\)\|')).Count -ne $columnCount) {
            throw "Inconsistent table columns in ${DocumentPath}: $row"
        }
    }
    foreach ($cell in [regex]::Split($Rows[1].Trim().Trim('|'), '(?<!\\)\|')) {
        if ($cell.Trim() -notmatch '^:?-{3,}:?$') {
            throw "Invalid table separator: $DocumentPath"
        }
    }
}

function Assert-MarkdownDocument {
    param([string]$Document, [string]$DocumentPath)

    if ($Document.Contains([char]0xFFFD)) {
        throw "Unicode replacement character: $DocumentPath"
    }
    if ($Document -match '(?m)^(<<<<<<< |=======\s*$|>>>>>>> )') {
        throw "Unresolved merge conflict markers: $DocumentPath"
    }

    $headings = @()
    $tableRows = @()
    $proseLines = @()
    $fence = $null
    $tableCount = 0
    foreach ($line in ($Document -split '\r?\n')) {
        if ($null -ne $fence) {
            if ($line -match ('^\s{0,3}' + [regex]::Escape($fence.Substring(0, 1)) + '{' + $fence.Length + ',}\s*$')) {
                $fence = $null
            }
            continue
        }
        if ($line -match '^\s{0,3}(`{3,}|~{3,})') {
            Assert-MarkdownTable -Rows $tableRows -DocumentPath $DocumentPath
            if ($tableRows.Count -gt 0) { $tableCount++ }
            $tableRows = @()
            $fence = $Matches[1]
            continue
        }
        $proseLines += $line
        if ($line -match '^#{1,6} ') { $headings += $line }
        if ($line -match '^\|') {
            $tableRows += $line
        } else {
            Assert-MarkdownTable -Rows $tableRows -DocumentPath $DocumentPath
            if ($tableRows.Count -gt 0) { $tableCount++ }
            $tableRows = @()
        }
    }
    if ($null -ne $fence) { throw "Unclosed code fence: $DocumentPath" }
    Assert-MarkdownTable -Rows $tableRows -DocumentPath $DocumentPath
    if ($tableRows.Count -gt 0) { $tableCount++ }

    if ($headings.Count -eq 0 -or @($headings | Where-Object { $_ -match '^# ' }).Count -ne 1) {
        throw "Exactly one top-level heading is required: $DocumentPath"
    }
    $previousLevel = 0
    $headingNames = [System.Collections.Generic.HashSet[string]]::new()
    foreach ($heading in $headings) {
        $level = [regex]::Match($heading, '^#+').Length
        if ($level -gt $previousLevel + 1) { throw "Skipped heading level: $heading" }
        if (-not $headingNames.Add($heading)) { throw "Duplicate heading: $heading" }
        $previousLevel = $level
    }
    if ($tableCount -eq 0) { throw "At least one design table is required: $DocumentPath" }

    # Validate repository-relative file links. External URLs are reviewed separately.
    foreach ($link in [regex]::Matches(($proseLines -join "`n"), '\[[^\]]*\]\(([^\s)]+)\)')) {
        $target = $link.Groups[1].Value
        if ($target -match '^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|#)') { continue }
        $relativePath = [Uri]::UnescapeDataString(($target -split '#', 2)[0])
        $resolvedPath = Join-Path (Split-Path -Parent $DocumentPath) $relativePath
        if (-not (Test-Path -LiteralPath $resolvedPath)) {
            throw "Broken local link in ${DocumentPath}: $target"
        }
    }

    Write-Output "PASS: $DocumentPath ($($headings.Count) headings, $tableCount tables, UTF-8, fences, conflict markers and local links)."
}

$documentPaths = @(
    (Join-Path $projectRoot 'product-design.md'),
    (Join-Path $projectRoot 'docs/technical-design.md')
)
$documentPaths += @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'docs') -Filter '*.md' -File -Recurse | ForEach-Object { $_.FullName })
foreach ($documentPath in ($documentPaths | Sort-Object -Unique)) {
    $document = $strictUtf8.GetString([System.IO.File]::ReadAllBytes($documentPath))
    Assert-MarkdownDocument -Document $document -DocumentPath $documentPath
}
