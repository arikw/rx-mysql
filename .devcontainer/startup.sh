#!/bin/bash

echo "Checking setup..."
if [ ! -f /home/vscode/.local/share/fnm/fnm ]; then
  echo "Installing FNM (Fast Node Manager)..."
  curl -fsSL https://fnm.vercel.app/install | bash
fi

if [ -f /home/vscode/.docker/config.json ]; then
  echo "Configuring Docker credentials..."
  jq 'del(.credsStore)' /home/vscode/.docker/config.json > /home/vscode/.docker/config.json.tmp && mv /home/vscode/.docker/config.json.tmp /home/vscode/.docker/config.json
fi

if [ ! -d /home/vscode/.local/share/fnm ]; then
  echo "FNM installation failed. Please check the logs."
else
  echo "FNM installed successfully."
  source /home/vscode/.bashrc
  eval "$(fnm env)"
fi
