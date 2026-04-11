#!/bin/bash

# 1. Build the Admin React app
echo "Building Admin Desktop..."
cd admin
npm install
npm run build
cd ..

# 2. Create final distribution folder
echo "Assembling distribution..."
mkdir -p dist/admin

# 3. Copy Admin build to /admin subfolder
cp -r admin/dist/* dist/admin/

# 4. Copy root static files to root of /dist
cp index.html dist/
cp prototype.html dist/
cp echelon-logo-v10.html dist/
cp racer-sportif-logo.png dist/ 2>/dev/null || true
cp vechelon-halfchainring.svg dist/ 2>/dev/null || true

echo "Build complete."
