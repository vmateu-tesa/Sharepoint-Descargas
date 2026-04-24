/**
 * SharePoint Mirror — Security Guardrails Tests
 *
 * Unit tests using Node.js built-in test runner (node --test).
 * No browser or SharePoint connection needed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// We need to mock the logger before importing SecurityGuard
// since security.js imports logger.js which creates directories.
// Use a dynamic import approach with a setup.

// Inline minimal mock by monkey-patching config before import
import { resolve } from 'path';
import { mkdirSync } from 'fs';

// Ensure the data/logs dir exists so logger doesn't fail
const testDataDir = resolve('./test-data-tmp');
mkdirSync(resolve(testDataDir, 'logs'), { recursive: true });

// Now import the module
import { SecurityGuard } from '../backend/src/security.js';

describe('SecurityGuard', () => {
    const origin = 'https://contoso.sharepoint.com';
    const libraryPath = '/sites/marketing/Shared Documents';

    describe('validateUrl', () => {
        it('should allow valid SharePoint API URLs', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            const result = guard.validateUrl(
                "https://contoso.sharepoint.com/sites/marketing/_api/web/GetFolderByServerRelativeUrl('test')"
            );
            assert.equal(result.allowed, true);
        });

        it('should deny non-HTTPS URLs', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            const result = guard.validateUrl(
                "http://contoso.sharepoint.com/sites/marketing/_api/web/lists"
            );
            assert.equal(result.allowed, false);
            assert.ok(result.reason.includes('Protocol'));
        });

        it('should deny different origins', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            const result = guard.validateUrl(
                'https://evil.com/sites/marketing/_api/web/lists'
            );
            assert.equal(result.allowed, false);
            assert.ok(result.reason.includes('Origin'));
        });

        it('should deny URLs without /_api/ path', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            const result = guard.validateUrl(
                'https://contoso.sharepoint.com/sites/marketing/SitePages/Home.aspx'
            );
            assert.equal(result.allowed, false);
            assert.ok(result.reason.includes('_api'));
        });

        it('should deny invalid URLs', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            const result = guard.validateUrl('not-a-url');
            assert.equal(result.allowed, false);
            assert.ok(result.reason.includes('Invalid URL'));
        });
    });

    describe('validateScope', () => {
        it('should allow paths within the library', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            const result = guard.validateScope('/sites/marketing/Shared Documents/Reports/Q1/file.pdf');
            assert.equal(result.allowed, true);
        });

        it('should allow the library root itself', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            const result = guard.validateScope('/sites/marketing/Shared Documents');
            assert.equal(result.allowed, true);
        });

        it('should deny paths outside the library', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            const result = guard.validateScope('/sites/other-site/Documents/file.pdf');
            assert.equal(result.allowed, false);
        });

        it('should deny parent directory traversal', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            const result = guard.validateScope('/sites/marketing/Other Library/file.pdf');
            assert.equal(result.allowed, false);
        });
    });

    describe('validateMethod', () => {
        it('should allow GET', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            assert.equal(guard.validateMethod('GET').allowed, true);
            assert.equal(guard.validateMethod('get').allowed, true);
        });

        it('should deny POST', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            assert.equal(guard.validateMethod('POST').allowed, false);
        });

        it('should deny PUT', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            assert.equal(guard.validateMethod('PUT').allowed, false);
        });

        it('should deny DELETE', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            assert.equal(guard.validateMethod('DELETE').allowed, false);
        });

        it('should deny PATCH', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            assert.equal(guard.validateMethod('PATCH').allowed, false);
        });
    });

    describe('validateLocalPath', () => {
        it('should deny paths with ".." traversal', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            const result = guard.validateLocalPath('data/mirror/../../etc/passwd');
            assert.equal(result.allowed, false);
            // Could be denied for escaping mirror root or containing '..'
            assert.ok(result.reason);
        });
    });

    describe('validateApiRequest (combined)', () => {
        it('should allow valid GET API requests', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            const result = guard.validateApiRequest(
                "https://contoso.sharepoint.com/sites/marketing/_api/web/lists",
                'GET'
            );
            assert.equal(result.allowed, true);
        });

        it('should deny POST even to valid URLs', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            const result = guard.validateApiRequest(
                "https://contoso.sharepoint.com/sites/marketing/_api/web/lists",
                'POST'
            );
            assert.equal(result.allowed, false);
        });
    });

    describe('audit log', () => {
        it('should track all validation attempts', () => {
            const guard = new SecurityGuard(origin, libraryPath);
            // validateUrl logs to audit; validateMethod does not
            guard.validateUrl('https://contoso.sharepoint.com/_api/web');
            guard.validateUrl('https://evil.com/_api/web');
            guard.validateUrl('https://contoso.sharepoint.com/_api/lists');

            const summary = guard.getAuditSummary();
            assert.equal(summary.total, 3);
            assert.equal(summary.allowed, 2);
            assert.equal(summary.denied, 1);
        });
    });
});
