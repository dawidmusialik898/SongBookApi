param(
    [string]$BaseUri = "https://localhost:7152",
    [Parameter(Mandatory = $true)]
    [string]$Email,
    [Parameter(Mandatory = $true)]
    [string]$Password
)

$ErrorActionPreference = "Stop"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

function Get-Csrf {
    (Invoke-RestMethod -Uri "$BaseUri/auth/antiforgery" -WebSession $session).token
}

function Invoke-Mutation {
    param(
        [string]$Method,
        [string]$Path,
        [object]$Body
    )

    $arguments = @{
        Uri = "$BaseUri$Path"
        Method = $Method
        WebSession = $session
        Headers = @{ "X-CSRF-TOKEN" = (Get-Csrf) }
    }
    if ($null -ne $Body) {
        $arguments.ContentType = "application/json"
        $arguments.Body = $Body | ConvertTo-Json -Depth 10
    }
    Invoke-RestMethod @arguments
}

Invoke-Mutation POST "/auth/login" @{
    email = $Email
    password = $Password
    rememberMe = $false
}

$suffix = [Guid]::NewGuid().ToString("N").Substring(0, 8)
$book = Invoke-Mutation POST "/songbooks" @{ name = "Curl Book $suffix" }
Write-Host "Created book $($book.id) with access $($book.accessLevel)"

$song = Invoke-Mutation POST "/songbooks/$($book.id)/songs" @{
    title = "Curl Song"
    author = "Curl"
    parts = @(
        @{ name = "Verse"; text = "First" },
        @{ name = "Chorus"; text = "Second" }
    )
}
Write-Host "Created song $($song.id)"

$songs = Invoke-RestMethod -Uri "$BaseUri/songbooks/$($book.id)/songs" -WebSession $session
if (($songs | Measure-Object).Count -ne 1) {
    throw "Expected one nested song."
}

Invoke-Mutation PUT "/songbooks/$($book.id)/songs/$($song.id)" @{
    title = "Curl Song Updated"
    author = "Curl"
    parts = @(
        @{
            id = $song.parts[1].id
            name = "Chorus"
            text = "Second updated"
        },
        @{
            id = $song.parts[0].id
            name = "Verse"
            text = "First updated"
        }
    )
}

$updated = Invoke-RestMethod `
    -Uri "$BaseUri/songbooks/$($book.id)/songs/$($song.id)" `
    -WebSession $session
if ($updated.title -ne "Curl Song Updated" -or $updated.parts[0].name -ne "Chorus") {
    throw "Nested update or persisted part order did not round-trip."
}

Invoke-Mutation DELETE "/songbooks/$($book.id)" $null
Invoke-Mutation POST "/auth/logout" @{}
Write-Host "Point-12 private song-book CRUD check passed."
