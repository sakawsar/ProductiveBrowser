import type { AdBlockStatus, Config, ExtensionInfo, ServiceState, SiteBadge, TabInfo } from '../shared/types'

declare global {
  interface Window {
    browserApi: {
      newTab(): void
      closeTab(id: number): void
      activate(id: number): void
      go(input: string): void
      back(): void
      forward(): void
      reload(): void
      settings(): void
      extensions(): void
      onTabs(cb: (tabs: TabInfo[]) => void): void
      onStatus(cb: (status: SiteBadge | null) => void): void
      onFocusAddress(cb: () => void): void
      adblockMenu(x: number, y: number): void
      onAdBlock(cb: (status: AdBlockStatus) => void): void
    }
    pb: {
      getState(): Promise<ServiceState>
      saveConfig(config: Config): Promise<ServiceState>
      onState(cb: (state: ServiceState) => void): void
      listExtensions(): Promise<ExtensionInfo[]>
      removeExtension(id: string): Promise<ExtensionInfo[]>
    }
  }
}
