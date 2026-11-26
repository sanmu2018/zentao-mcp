# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.21] - 2026-04-02

### Added
- `zentao bug get --with-images` downloads inline screenshots (`fileID` in steps/actions) via REST `/api.php/v1/files/:id`
- `zentao bug file --id <fileId>` to download a single ZenTao file
- Client helpers: `extractBugFileIds`, `downloadFile`, image cache under `~/.cache/zentao/files`

## [0.5.20] - 2026-04-02

### Added
- `zentao bug comment` via ZenTao session/PATH_INFO API (REST PUT comment is ignored on 22.x)
- `zentao bug resolve|close|activate|confirm|assign` using REST action endpoints
- `zentao bug append-steps` to append HTML into the bug steps/repro field
- Client helpers: `ensureSession`, `commentBug`, `resolveBug`, `closeBug`, `activateBug`, `confirmBug`, `assignBug`, `appendBugSteps`, `ensureHtmlComment`

## [0.2.1] - 2024-XX-XX

### Added
- Initial release
- ZenTao products list tool
- ZenTao bugs list tool
- ZenTao bugs stats tool
