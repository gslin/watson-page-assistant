VERSION := $(shell jq -r '.version' manifests/firefox/manifest.json)
CHROME_VERSION := $(shell echo "$(VERSION)" | awk -F. '{year=substr($$2,1,4); mmdd=substr($$2,5,4)+0; print "0." year "." mmdd "." $$3}')
FIREFOX_ZIP := watson-page-assistant-firefox-$(VERSION).zip
CHROME_ZIP := watson-page-assistant-chrome-$(CHROME_VERSION).zip

.PHONY: all build clean firefox chrome

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

clean:
	rm -rf dist/
	rm -f src/common/readability.min.js
