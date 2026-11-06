; Custom steps for the NSIS installer (electron-builder includes build/installer.nsh automatically).

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    ; Link on the installer's last page.
    !define MUI_FINISHPAGE_LINK "Made by CenoDigital - cenodigital.com"
    !define MUI_FINISHPAGE_LINK_LOCATION "https://cenodigital.com/?utm_source=typeshelf&utm_medium=app&utm_campaign=installer"
  !endif
!macroend

; Runs before the app's files are removed. Skipped during app updates, which
; reinstall over the old version and must keep fonts active.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "Turn off the fonts that Typeshelf activated?$\r$\n$\r$\nChoose No to keep them installed for your Windows account." /SD IDNO IDNO typeshelfKeepFonts
      ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --deactivate-all-fonts'
    typeshelfKeepFonts:
  ${endIf}
!macroend
