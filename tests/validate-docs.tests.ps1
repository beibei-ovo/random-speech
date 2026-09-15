$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'validate-docs.ps1')

# In-memory fixtures exercise the checks without changing repository documents.
$fixturePath = Join-Path $PSScriptRoot 'fixture.md'
$validDocument = @'
# Design

## First table

| Name | Value |
| --- | --- |
| A | B |

## Second table

| Name | Value | Notes |
| --- | --- | --- |
| C | D | E |

```text
# Not a document heading
| Not a table |
```

[Product](../docs/product-design.md)
'@

$testCount = 0
Assert-MarkdownDocument -Document $validDocument -DocumentPath $fixturePath | Out-Null
$testCount++

$escapedPipeDocument = $validDocument.Replace('| A | B |', '| A\|B | C |')
Assert-MarkdownDocument -Document $escapedPipeDocument -DocumentPath $fixturePath | Out-Null
$testCount++

$invalidCases = @(
    @{ Name = 'broken table'; Text = $validDocument.Replace('| C | D | E |', '| C | D |'); Expected = 'Inconsistent table columns' },
    @{ Name = 'invalid separator'; Text = $validDocument.Replace('| --- | --- | --- |', '| --- | bad | --- |'); Expected = 'Invalid table separator' },
    @{ Name = 'broken local link'; Text = $validDocument.Replace('../docs/product-design.md', '../missing-design-for-test.md'); Expected = 'Broken local link' },
    @{ Name = 'unclosed fence'; Text = $validDocument + "`n``````text`nunfinished"; Expected = 'Unclosed code fence' },
    @{ Name = 'heading skip'; Text = $validDocument.Replace('## First table', '### First table'); Expected = 'Skipped heading level' },
    @{ Name = 'duplicate heading'; Text = $validDocument.Replace('## Second table', '## First table'); Expected = 'Duplicate heading' },
    @{ Name = 'second title'; Text = $validDocument.Replace('## Second table', '# Second title'); Expected = 'Exactly one top-level heading' },
    @{ Name = 'conflict marker'; Text = $validDocument + "`n<<<<<<< incoming"; Expected = 'Unresolved merge conflict' },
    @{ Name = 'invalid text'; Text = $validDocument + [char]0xFFFD; Expected = 'Unicode replacement character' },
    @{ Name = 'missing table'; Text = "# Design`n`nBody"; Expected = 'At least one design table' },
    @{ Name = 'incomplete table'; Text = "# Design`n`n| A | B |`n| --- | --- |"; Expected = 'Table requires a header' }
)

foreach ($testCase in $invalidCases) {
    $rejected = $false
    try {
        Assert-MarkdownDocument -Document $testCase.Text -DocumentPath $fixturePath | Out-Null
    } catch {
        if ($_.Exception.Message -notlike "*$($testCase.Expected)*") {
            throw "Unexpected error for $($testCase.Name): $($_.Exception.Message)"
        }
        $rejected = $true
    }
    if (-not $rejected) { throw "Invalid fixture passed: $($testCase.Name)" }
    $testCount++
}

$technicalPath = Join-Path $projectRoot 'docs/technical-design.md'
$technicalDocument = Get-Content -LiteralPath $technicalPath -Raw -Encoding UTF8
$technicalRequirements = @(
    @{ Name = 'dedicated ASR'; Pattern = '\u4e13\u7528 ASR' },
    @{ Name = 'local audio metrics'; Pattern = 'Web Audio \u5206\u6790' },
    @{ Name = 'relative volume'; Pattern = 'RMS.*\u76f8\u5bf9\u632f\u5e45' },
    @{ Name = 'segment timestamps'; Pattern = '\u5206\u6bb5\u65f6\u95f4\u6233' },
    @{ Name = 'timestamp fallback'; Pattern = '\u4e0d\u901a\u8fc7\u63d0\u793a\u8bcd\u8981\u6c42\u6a21\u578b\u731c\u6d4b' },
    @{ Name = 'four feedback dimensions'; Pattern = '\u6f14\u8bb2\u8868\u73b0.*\u8bed\u901f\u3001\u505c\u987f\u3001\u586b\u5145\u8bcd' },
    @{ Name = 'multimodal second opinion boundary'; Pattern = '\u591a\u6a21\u6001\u6a21\u578b\u53ef\u4ee5\u4f5c\u4e3a\u53ef\u9009\u7684\u7b2c\u4e8c\u610f\u89c1' },
    @{ Name = 'text-only correction reanalysis'; Pattern = '\u53ea\u91cd\u65b0\u5206\u6790\u6587\u672c\uff0c\u590d\u7528\u540c\u4e00 attempt \u7684\u97f3\u9891\u6307\u6807' }
)
foreach ($requirement in $technicalRequirements) {
    if (-not [regex]::IsMatch($technicalDocument, $requirement.Pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)) {
        throw "Technical design contract missing: $($requirement.Name)"
    }
    $testCount++
}

Write-Output "PASS: $testCount documentation validator and technical design regression cases."
