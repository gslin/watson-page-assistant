VERSION := $(shell jq -r '.version' manifests/firefox/manifest.json)
CHROME_VERSION := $(shell echo "$(VERSION)" | awk -F. '{year=substr($$2,1,4); mmdd=substr($$2,5,4)+0; print "0." year "." mmdd "." $$3}')
FIREFOX_ZIP := watson-page-assistant-firefox-$(VERSION).zip
CHROME_ZIP := watson-page-assistant-chrome-$(CHROME_VERSION).zip

.PHONY: all build clean firefox chrome deploy deploy-firefox deploy-chrome

all: firefox chrome

build:
	npm run build:all
	jq --arg v "$(CHROME_VERSION)" '.version = $$v' manifests/chrome/manifest.json > dist/chrome/manifest.json

firefox: build
	rm -f dist/$(FIREFOX_ZIP)
	cd dist/firefox && zip -r ../$(FIREFOX_ZIP) .

chrome: build
	rm -f dist/$(CHROME_ZIP)
	cd dist/chrome && zip -r ../$(CHROME_ZIP) .

deploy-firefox: firefox
	@if [ ! -f .env ]; then echo 'Missing .env. Copy .env.example to .env and fill in credentials.' >&2; exit 1; fi
	set -a && . ./.env && set +a && \
	if [ -z "$$WEB_EXT_API_KEY" ] || [ -z "$$WEB_EXT_API_SECRET" ]; then \
		echo 'WEB_EXT_API_KEY and WEB_EXT_API_SECRET must be set in .env' >&2; exit 1; \
	fi && \
	npx --yes web-ext@latest sign --source-dir=dist/firefox --artifacts-dir=dist/web-ext-artifacts --channel=listed --approval-timeout=0

deploy-chrome: chrome
	@if [ ! -f .env ]; then echo 'Missing .env. Copy .env.example to .env and fill in credentials.' >&2; exit 1; fi
	set -a && . ./.env && set +a && \
	if [ -z "$$CHROME_CLIENT_ID" ] || [ -z "$$CHROME_CLIENT_SECRET" ] || [ -z "$$CHROME_REFRESH_TOKEN" ] || [ -z "$$CHROME_PUBLISHER_ID" ] || [ -z "$$CHROME_EXTENSION_ID" ]; then \
		echo 'CHROME_CLIENT_ID, CHROME_CLIENT_SECRET, CHROME_REFRESH_TOKEN, CHROME_PUBLISHER_ID, and CHROME_EXTENSION_ID must be set in .env' >&2; exit 1; \
	fi && \
	CLIENT_ID="$$CHROME_CLIENT_ID" \
	CLIENT_SECRET="$$CHROME_CLIENT_SECRET" \
	REFRESH_TOKEN="$$CHROME_REFRESH_TOKEN" \
	PUBLISHER_ID="$$CHROME_PUBLISHER_ID" \
	npx --yes chrome-webstore-upload-cli --source dist/$(CHROME_ZIP) --extension-id "$$CHROME_EXTENSION_ID"

deploy: deploy-firefox deploy-chrome

clean:
	rm -rf dist/
	rm -f src/common/readability.min.js
