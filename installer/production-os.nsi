Unicode True
!include "MUI2.nsh"

!ifndef PAYLOAD
  !error "PAYLOAD must point to the packaged application directory"
!endif
!ifndef JSON_TEMPLATES
  !error "JSON_TEMPLATES must point to the initial JSON directory"
!endif
!ifndef OUTPUT_FILE
  !error "OUTPUT_FILE must point to the installer executable"
!endif
!ifndef COMMIT_SHA
  !define COMMIT_SHA "development"
!endif

Name "Gaming Oasis Production OS"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Gaming Oasis\Production OS"
InstallDirRegKey HKCU "Software\Gaming Oasis\Production OS" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "Gaming Oasis"

VIProductVersion "0.1.0.0"
VIAddVersionKey /LANG=1033 "ProductName" "Gaming Oasis Production OS"
VIAddVersionKey /LANG=1033 "CompanyName" "Gaming Oasis"
VIAddVersionKey /LANG=1033 "FileDescription" "Gaming Oasis Production OS installer"
VIAddVersionKey /LANG=1033 "FileVersion" "0.1.0"
VIAddVersionKey /LANG=1033 "ProductVersion" "0.1.0 (${COMMIT_SHA})"

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\Run Gaming Oasis Production OS.bat"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Gaming Oasis Production OS"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "Gaming Oasis Production OS" SEC_MAIN
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  SetOverwrite on
  File /r "${PAYLOAD}\*"

  ; Production output survives reinstalling or upgrading the application.
  SetOutPath "$INSTDIR\JSONs"
  SetOverwrite off
  File /r "${JSON_TEMPLATES}\*"
  SetOverwrite on

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Gaming Oasis\Production OS" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Gaming Oasis Production OS" "DisplayName" "Gaming Oasis Production OS"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Gaming Oasis Production OS" "DisplayVersion" "0.1.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Gaming Oasis Production OS" "Publisher" "Gaming Oasis"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Gaming Oasis Production OS" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Gaming Oasis Production OS" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Gaming Oasis Production OS" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Gaming Oasis Production OS" "NoRepair" 1

  CreateDirectory "$SMPROGRAMS\Gaming Oasis"
  CreateShortCut "$SMPROGRAMS\Gaming Oasis\Gaming Oasis Production OS.lnk" "$INSTDIR\Run Gaming Oasis Production OS.bat"
  CreateShortCut "$DESKTOP\Gaming Oasis Production OS.lnk" "$INSTDIR\Run Gaming Oasis Production OS.bat"
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON1 \
    "Keep the production JSON output and downloaded sponsor assets?" \
    IDNO remove_all

  StrCpy $0 "$LOCALAPPDATA\Gaming Oasis\Production OS data"
  IfFileExists "$0" data_conflict
  Rename "$INSTDIR\JSONs" "$0"
  RMDir /r "$INSTDIR"
  MessageBox MB_OK|MB_ICONINFORMATION "Production data was preserved in:$\r$\n$0"
  Goto remove_shortcuts

data_conflict:
  MessageBox MB_OK|MB_ICONSTOP "Uninstall stopped because this preservation folder already exists:$\r$\n$0$\r$\n$\r$\nMove or rename that folder, then run the uninstaller again."
  Abort

remove_all:
  RMDir /r "$INSTDIR"

remove_shortcuts:
  Delete "$SMPROGRAMS\Gaming Oasis\Gaming Oasis Production OS.lnk"
  RMDir "$SMPROGRAMS\Gaming Oasis"
  Delete "$DESKTOP\Gaming Oasis Production OS.lnk"
  DeleteRegKey HKCU "Software\Gaming Oasis\Production OS"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Gaming Oasis Production OS"
SectionEnd
