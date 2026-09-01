import { Excalidraw } from '@excalidraw/excalidraw'

export interface ExcalidrawCanvasProps {
  onApiReady: (api: any) => void
  rawLibraryItems: readonly unknown[]
  isCanvasFrozen: boolean
  theme: 'dark' | 'light'
}

export function ExcalidrawCanvas({
  onApiReady,
  rawLibraryItems,
  isCanvasFrozen,
  theme
}: ExcalidrawCanvasProps) {
  return (
    <div className="excalidraw-wrapper">
      <Excalidraw
        excalidrawAPI={(api) => {
          onApiReady(api)
          if (rawLibraryItems.length > 0) {
            api.updateLibrary({
              libraryItems: rawLibraryItems as any,
              merge: true
            })
          }
        }}
        viewModeEnabled={isCanvasFrozen}
        theme={theme}
      />
    </div>
  )
}
