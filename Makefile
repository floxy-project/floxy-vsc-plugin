.PHONY: install-tools
install-tools:
	npm install -g yo generator-code vsce typescript

.PHONY: install
install:
	code --install-extension floxy-vscode-0.0.1.vsix
