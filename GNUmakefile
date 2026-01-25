VERSION := $(shell node -p "require('./package.json').version")

.PHONY: build clean

build:
	npm run build:all
	cd dist/firefox && zip -r ../watson-page-assistant-$(VERSION)-firefox.zip .
	cd dist/chrome && zip -r ../watson-page-assistant-$(VERSION)-chrome.zip .

clean:
	rm -rf dist/
	rm -f src/common/readability.min.js
