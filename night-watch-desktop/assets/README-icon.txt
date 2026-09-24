Put your Windows icon here as:  icon.ico

Requirements for a crisp itch.io / desktop icon:
  • .ico containing multiple sizes: 16, 24, 32, 48, 64, 128, 256 px
  • 256x256 must be present (electron-builder & Windows require it)

Make one from a PNG:
  • https://icoconvert.com  (online), or
  • ImageMagick:  magick icon-1024.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
If assets/icon.ico is missing, electron-builder uses Electron's default icon.
