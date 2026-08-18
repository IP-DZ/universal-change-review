import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const extensionSource = join(root, 'cursor-extension')
const version = JSON.parse(await import('node:fs').then(({ readFileSync }) => readFileSync(join(extensionSource, 'package.json'), 'utf8'))).version
const output = join(root, 'dist', `universal-change-review-cursor-${version}.vsix`)
const staging = mkdtempSync(join(tmpdir(), 'ucr-vsix-'))

try {
  const extension = join(staging, 'extension')
  mkdirSync(extension, { recursive: true })
  cpSync(extensionSource, extension, { recursive: true })
  mkdirSync(join(extension, 'server', 'src'), { recursive: true })
  for (const file of ['git.js', 'panel.js']) cpSync(join(root, 'src', file), join(extension, 'server', 'src', file))
  writeFileSync(join(extension, 'server', 'package.json'), '{"type":"module"}\n')
  cpSync(join(root, 'LICENSE'), join(extension, 'LICENSE'))

  writeFileSync(join(staging, 'extension.vsixmanifest'), manifest(version))
  writeFileSync(join(staging, '[Content_Types].xml'), contentTypes())
  mkdirSync(dirname(output), { recursive: true })
  if (existsSync(output)) rmSync(output)
  execFileSync('zip', ['-q', '-r', output, 'extension', 'extension.vsixmanifest', '[Content_Types].xml'], { cwd: staging })
  process.stdout.write(`${output}\n`)
} finally {
  rmSync(staging, { recursive: true, force: true })
}

function manifest(version) {
  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="universal-change-review" Version="${version}" Publisher="ip-dz"/>
    <DisplayName>Universal Change Review</DisplayName>
    <Description xml:space="preserve">Open a live, read-only Changes panel from the Cursor activity bar.</Description>
    <Tags>changes,diff,review,git,cursor</Tags>
    <Categories>Other</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.90.0"/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/>
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/>
    </Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/>
  </Assets>
</PackageManifest>`
}

function contentTypes() {
  return `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="js" ContentType="application/javascript"/>
  <Default Extension="svg" ContentType="image/svg+xml"/>
  <Default Extension="md" ContentType="text/markdown"/>
  <Default Extension="txt" ContentType="text/plain"/>
  <Default Extension="vsixmanifest" ContentType="text/xml"/>
</Types>`
}
