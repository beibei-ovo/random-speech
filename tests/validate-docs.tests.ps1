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

[Product](../product-design.md)
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
    @{ Name = 'broken local link'; Text = $validDocument.Replace('../product-design.md', '../missing-design-for-test.md'); Expected = 'Broken local link' },
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

Write-Output "PASS: $testCount documentation validator regression cases."
