; Installs the background service, and refuses to uninstall while the rules are locked.
!define SERVICE_EXE "$INSTDIR\resources\winsw\ProductiveBrowserService.exe"

!macro removeChromiumPolicies ROOT
  DeleteRegKey HKLM "${ROOT}\URLBlocklist"
  DeleteRegValue HKLM "${ROOT}" "DnsOverHttpsMode"
  DeleteRegValue HKLM "${ROOT}" "DnsOverHttpsTemplates"
!macroend

!macro customInit
  ; Upgrades replace the files the running service uses.
  IfFileExists "${SERVICE_EXE}" 0 +2
    nsExec::Exec '"${SERVICE_EXE}" stop'
!macroend

!macro customInstall
  nsExec::ExecToLog '"${SERVICE_EXE}" install'
  nsExec::ExecToLog '"${SERVICE_EXE}" start'
!macroend

!macro customUnInit
  ${ifNot} ${isUpdated}
    nsExec::Exec '"$INSTDIR\Productive Browser.exe" --can-uninstall'
    Pop $0
    ${if} $0 == "1"
      MessageBox MB_ICONSTOP "Your limits are locked. Productive Browser can be uninstalled after the lock ends."
      Quit
    ${endIf}
  ${endIf}
!macroend

!macro customUnInstall
  nsExec::ExecToLog '"${SERVICE_EXE}" stop'
  nsExec::ExecToLog '"${SERVICE_EXE}" uninstall'
  ${ifNot} ${isUpdated}
    ; Full uninstall: remove the other-browser blocklists and filter DNS, the marker and the sealed state.
    !insertmacro removeChromiumPolicies "SOFTWARE\Policies\Google\Chrome"
    !insertmacro removeChromiumPolicies "SOFTWARE\Policies\Microsoft\Edge"
    !insertmacro removeChromiumPolicies "SOFTWARE\Policies\BraveSoftware\Brave"
    DeleteRegKey HKLM "SOFTWARE\Policies\Mozilla\Firefox\WebsiteFilter"
    DeleteRegKey HKLM "SOFTWARE\Policies\Mozilla\Firefox\DNSOverHTTPS"
    DeleteRegKey HKLM "SOFTWARE\ProductiveBrowser"
    ReadEnvStr $1 ProgramData
    RMDir /r "$1\ProductiveBrowser"
  ${endIf}
!macroend
