$ProgressPreference = 'SilentlyContinue'
Write-Host "Downloading Node.js installer..."
$nodeUrl = "https://nodejs.org/dist/v18.17.1/node-v18.17.1-x64.msi"
$installerPath = "$env:TEMP\node_installer.msi"
Invoke-WebRequest -Uri $nodeUrl -OutFile $installerPath

Write-Host "Installing Node.js..."
Start-Process msiexec.exe -Wait -ArgumentList "/i `"$installerPath`" /quiet"

Write-Host "Cleaning up..."
Remove-Item $installerPath

Write-Host "Node.js installation completed. Please restart your terminal to use npm."
