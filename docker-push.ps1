# Build and push Indobase Studio image to Docker Hub
# 1. Log in once: docker login
# 2. Run: .\docker-push.ps1   (defaults to roshanraghavander, or use -DockerHubUser "other")

param(
    [string]$DockerHubUser = $env:DOCKERHUB_USER,
    [string]$ImageTag = "latest"
)

if (-not $DockerHubUser) { $DockerHubUser = "roshanraghavander" }

$ImageName = "indobase-studio"
$RemoteTag = "${DockerHubUser}/${ImageName}:${ImageTag}"

Write-Host "Building image (this may take several minutes)..." -ForegroundColor Cyan
Set-Location $PSScriptRoot
docker build -t "${ImageName}:${ImageTag}" .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Tagging: $RemoteTag" -ForegroundColor Cyan
docker tag "${ImageName}:${ImageTag}" $RemoteTag

Write-Host "Pushing to Docker Hub (login if prompted)..." -ForegroundColor Cyan
docker push $RemoteTag

if ($LASTEXITCODE -ne 0) {
    Write-Host "Push failed. Run: docker login" -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "Done. Image: https://hub.docker.com/r/$DockerHubUser/${ImageName}/tags" -ForegroundColor Green
