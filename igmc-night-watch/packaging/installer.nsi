; IGMC: Night Watch — Windows installer
; Copyright (c) 2026 NIKJYAR Studios. All rights reserved.
Unicode true
ManifestDPIAware true
!include "MUI2.nsh"

!define APPNAME   "IGMC Night Watch"
!define APPTITLE  "IGMC: Night Watch"
!define COMPANY   "NIKJYAR Studios"
!define VERSION   "1.0.0"
!define EXE       "IGMC Night Watch.exe"
!define UNKEY     "Software\Microsoft\Windows\CurrentVersion\Uninstall\NIKJYARStudios.IGMCNightWatch"
!ifndef BUILD
  !define BUILD "build"
!endif

Name "${APPTITLE}"
Caption "${APPTITLE} Setup — ${COMPANY}"
OutFile "${BUILD}\IGMC Night Watch Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\${COMPANY}\${APPNAME}"
InstallDirRegKey HKCU "Software\${COMPANY}\${APPNAME}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
CRCCheck force
BrandingText "© 2026 ${COMPANY}"

VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName" "${APPTITLE}"
VIAddVersionKey "CompanyName" "${COMPANY}"
VIAddVersionKey "LegalCopyright" "© 2026 ${COMPANY}. All rights reserved."
VIAddVersionKey "FileDescription" "${APPTITLE} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "Comments" "Made by ${COMPANY}"

!define MUI_ICON "assets\icon.ico"
!define MUI_UNICON "assets\icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "${APPTITLE}"
!define MUI_WELCOMEPAGE_TEXT "Made by ${COMPANY}.$\r$\n$\r$\nIGMC Shimla, 2:40 AM, bijli gayi hui hai. Andar ek aurat usi das minute mein phansi hai.$\r$\n$\r$\nYe setup game ko tumhare computer par install karega aur Desktop par shortcut banayega.$\r$\n$\r$\nHorror game: khoon, achanak tez awaaz aur flashing lights hain.$\r$\n$\r$\nNext dabao."
!define MUI_LICENSEPAGE_TEXT_TOP "Copyright aur licence — install karne se pehle padho."
!define MUI_FINISHPAGE_TITLE "${APPTITLE} install ho gaya"
!define MUI_FINISHPAGE_TEXT "Desktop par 'IGMC Night Watch' se game chalao.$\r$\n$\r$\n© 2026 ${COMPANY}. All rights reserved."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Abhi khelo (Play now)"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File "${BUILD}\${EXE}"
  File "LICENSE.txt"
  File "README.txt"
  File "assets\icon.ico"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\${COMPANY}"
  CreateShortcut "$SMPROGRAMS\${COMPANY}\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\icon.ico" 0
  CreateShortcut "$SMPROGRAMS\${COMPANY}\Uninstall ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\icon.ico" 0

  WriteRegStr HKCU "Software\${COMPANY}\${APPNAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "${APPTITLE}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "${COMPANY}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr HKCU "${UNKEY}" "QuietUninstallString" "$\"$INSTDIR\Uninstall.exe$\" /S"
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNKEY}" "EstimatedSize" 24000
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\${EXE}"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  RMDir "$LOCALAPPDATA\Programs\${COMPANY}"
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${COMPANY}\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${COMPANY}\Uninstall ${APPNAME}.lnk"
  RMDir "$SMPROGRAMS\${COMPANY}"
  ; the game window's browser profile, which holds the saved game
  RMDir /r "$LOCALAPPDATA\${COMPANY}\${APPNAME}"
  RMDir "$LOCALAPPDATA\${COMPANY}"
  DeleteRegKey HKCU "${UNKEY}"
  DeleteRegKey HKCU "Software\${COMPANY}\${APPNAME}"
  DeleteRegKey /ifempty HKCU "Software\${COMPANY}"
SectionEnd
