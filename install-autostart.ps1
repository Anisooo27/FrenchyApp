# Installe un raccourci dans le dossier Demarrage de Windows pour que
# la caisse Frenchy se lance automatiquement a l'ouverture de session.
#
# A executer UNE SEULE FOIS, directement sur le PC/tablette du magasin
# (pas sur un PC de developpement) :
#   1. Clic droit sur ce fichier > "Executer avec PowerShell"
#      (ou, dans un terminal PowerShell : .\install-autostart.ps1)
#
# Pour desinstaller le demarrage automatique : supprimez simplement le
# raccourci "Frenchy POS.lnk" dans le dossier Demarrage
# (touche Windows + R, tapez "shell:startup", Entree).

$ErrorActionPreference = 'Stop'

$startupFolder = [Environment]::GetFolderPath('Startup')
$shortcutPath  = Join-Path $startupFolder 'Frenchy POS.lnk'
$targetPath    = Join-Path $PSScriptRoot 'start.bat'

if (-not (Test-Path $targetPath)) {
    Write-Error "Introuvable : $targetPath. Executez ce script depuis le dossier du projet frenchy-pos."
    exit 1
}

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = $targetPath
$Shortcut.WorkingDirectory = $PSScriptRoot
$Shortcut.WindowStyle = 1
$Shortcut.Description = 'Demarre la caisse Frenchy au demarrage de Windows'
$Shortcut.Save()

Write-Host "Demarrage automatique installe avec succes." -ForegroundColor Green
Write-Host "Raccourci cree : $shortcutPath"
Write-Host "La caisse se lancera automatiquement a la prochaine ouverture de session Windows."
