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
# Unicode escapes keep this script compatible with Windows PowerShell 5.1.
# Scope checks to the design section so mentions elsewhere cannot mask a missing decision.
$technicalRequirements = @(
    @{ Name = 'configurable transcription'; Section = '1.'; Pattern = '\u670d\u52a1\u9009\u62e9.*?\u4e13\u7528 ASR.*?\u652f\u6301\u97f3\u9891\u8f93\u5165\u7684\u5927\u6a21\u578b' },
    @{ Name = 'local audio metrics'; Section = '6.'; Pattern = 'Web Audio \u5206\u6790' },
    @{ Name = 'relative volume'; Section = '6.'; Pattern = 'RMS.*?\u76f8\u5bf9\u632f\u5e45' },
    @{ Name = 'independent pause detection'; Section = '6.1'; Pattern = '\u6ca1\u6709\u8f6c\u5199\u65f6\u95f4\u6233\u65f6.*?\u672c\u5730\u97f3\u91cf\u4e0e\u9759\u97f3/VAD \u505c\u987f\u68c0\u6d4b\u4e5f\u53ef\u72ec\u7acb\u8fd0\u884c' },
    @{ Name = 'timestamp fallback'; Section = '6.2'; Pattern = '\u65f6\u95f4\u6233\u7f3a\u5931\u4e0d\u963b\u65ad\u9010\u5b57\u7a3f\u4fdd\u5b58\u4e0e\u6587\u672c\u8bc4\u4ef7.*?\u4e0d\u901a\u8fc7\u63d0\u793a\u8bcd\u8981\u6c42\u6a21\u578b\u731c\u6d4b' },
    @{ Name = 'independent connections'; Section = '8.1'; Pattern = '`transcription`[^\r\n]*`adapterId`[^\r\n]*`baseUrl`[^\r\n]*`credentialRef`[^\r\n]*`model`.*?`feedback`[^\r\n]*`adapterId`[^\r\n]*`baseUrl`[^\r\n]*`credentialRef`[^\r\n]*`model`' },
    @{ Name = 'reuse connection preserves roles'; Section = '8.1'; Pattern = 'reuseTranscriptionConnection.*?\u4ec5\u590d\u7528.*?\u8bc4\u4ef7\u63a5\u53e3\u9002\u914d\u5668\u4e0e\u6a21\u578b\u4ecd\u5355\u72ec\u9009\u62e9' },
    @{ Name = 'explicit configuration test'; Section = '8.1'; Pattern = '\u6d4b\u8bd5\u914d\u7f6e.*?\u4e0d\u8bfb\u53d6\u5386\u53f2\u5f55\u97f3.*?\u4fdd\u5b58\u8bbe\u7f6e\u4e0d\u81ea\u52a8\u53d1\u9001\u6d4b\u8bd5\u8bf7\u6c42' },
    @{ Name = 'existing configuration migration'; Section = '8.1'; Pattern = '\u5f53\u524d\u5b9e\u73b0\u4e0e\u8fc1\u79fb.*?\u5f85\u5b9e\u73b0\u8bbe\u8ba1.*?\u65e7\u5730\u5740\u548c\u5bc6\u94a5\u5f15\u7528.*?asrModel.*?feedbackModel' },
    @{ Name = 'two adapters one result'; Section = '8.2'; Pattern = 'ASR \u9002\u914d\u5668.*?\u591a\u6a21\u6001\u9002\u914d\u5668.*?\u4e24\u7c7b\u9002\u914d\u5668\u7edf\u4e00\u8fd4\u56de.*?`text`.*?`segments` / `words`.*?`startMs`.*?`endMs`.*?`timing`.*?`providerMeta`' },
    @{ Name = 'capability and fallback'; Section = '8.2'; Pattern = '\u97f3\u9891\u8f93\u5165\u3001MIME\u3001\u5927\u5c0f/\u65f6\u957f\u4e0a\u9650\u53ca\u6bb5\u7ea7/\u8bcd\u7ea7\u65f6\u95f4\u6233\u80fd\u529b.*?\u65f6\u95f4\u6233\u4e3a\u53ef\u9009\u80fd\u529b.*?\u4e0d\u81ea\u52a8\u6362\u4f9b\u5e94\u5546\u3001\u6a21\u578b\u6216\u989d\u5916\u4e0a\u4f20\u97f3\u9891' },
    @{ Name = 'multimodal transcription is supported'; Section = '8.'; Pattern = '\u591a\u6a21\u6001\u6a21\u578b\u662f\u6b63\u5f0f\u53ef\u9009\u7684\u8f6c\u5199\u5b9e\u73b0.*?\u540c\u4e00\u4e2a\u6a21\u578b.*?\u5206\u4e24\u6b21\u8c03\u7528.*?\u542c\u611f.*?\u4e24\u9879\u72ec\u7acb\u80fd\u529b' },
    @{ Name = 'correction metric and alignment versions'; Section = '8.3'; Pattern = '\u590d\u7528\u540c\u4e00 attempt \u7684\u5f55\u97f3\u4e0e\u97f3\u9891\u6458\u8981.*?\u91cd\u65b0\u8ba1\u7b97\u5b57\u6570\u3001\u8bed\u901f\u3001\u586b\u5145\u8bcd.*?\u4e0d\u91cd\u65b0\u4e0a\u4f20\u97f3\u9891.*?\u5f85\u91cd\u65b0\u5bf9\u9f50' },
    @{ Name = 'four feedback dimensions'; Section = '8.3'; Pattern = '\u5185\u5bb9\u7406\u89e3.*?\u7ed3\u6784\u7ec4\u7ec7.*?\u8868\u8fbe\u901a\u4fd7\u7a0b\u5ea6.*?\u6f14\u8bb2\u8868\u73b0.*?\u8bed\u901f\u3001\u505c\u987f\u3001\u586b\u5145\u8bcd' },
    @{ Name = 'adapter acceptance coverage'; Section = '11.'; Pattern = 'ASR \u4e0e\u591a\u6a21\u6001\u5047\u9002\u914d\u5668.*?\u65e7\u914d\u7f6e\u8fc1\u79fb.*?\u65f6\u95f4\u6233.*?\u6821\u6b63\u540e\u65e7\u5bf9\u9f50\u5931\u6548' }
)

function Get-DesignSection {
    param([string]$Document, [string]$Section)
    $pattern = '(?ms)^#{2,3} ' + [regex]::Escape($Section) + ' [^\r\n]*\r?\n(?<body>.*?)(?=^#{1,3} |\z)'
    return [regex]::Match($Document, $pattern)
}

function Assert-DesignRequirement {
    param([string]$Document, [hashtable]$Requirement)
    $section = Get-DesignSection -Document $Document -Section $Requirement.Section
    if (-not $section.Success -or -not [regex]::IsMatch(
        $section.Groups['body'].Value, $Requirement.Pattern,
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )) {
        throw "Technical design contract missing: $($Requirement.Name)"
    }
}

foreach ($requirement in $technicalRequirements) {
    Assert-DesignRequirement -Document $technicalDocument -Requirement $requirement
    $testCount++

    # Relocate the section body to the end: a global keyword search would still pass.
    # The scoped guard must reject losing the decision from its owning section.
    $section = Get-DesignSection -Document $technicalDocument -Section $requirement.Section
    $body = $section.Groups['body']
    $invalidDocument = $technicalDocument.Remove($body.Index, $body.Length) +
        "`n## Relocated fixture`n" + $body.Value
    $rejected = $false
    try {
        Assert-DesignRequirement -Document $invalidDocument -Requirement $requirement
    } catch {
        if ($_.Exception.Message -ne "Technical design contract missing: $($requirement.Name)") {
            throw
        }
        $rejected = $true
    }
    if (-not $rejected) { throw "Relocated design contract passed: $($requirement.Name)" }
    $testCount++
}

Write-Output "PASS: $testCount documentation validator and technical design regression cases."
