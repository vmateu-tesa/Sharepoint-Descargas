/**
 * SharePoint Mirror — Security Guardrails
 *
 * Enforces domain whitelist, GET-only methods, path scope, and local traversal prevention.
 */

import { resolve } from 'path';
import config from '../config.js';
import logger from './logger.js';

export class SecurityGuard {
    constructor(allowedOrigin, libraryPath) {
        this.allowedOrigin = allowedOrigin.replace(/\/+$/, '');
        this.libraryPath = libraryPath.replace(/\/+$/, '');
        this.mirrorRoot = resolve(config.mirrorDir);
        this.auditLog = [];
    }

    validateUrl(url) {
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:')
                return this._deny(url, `Protocol "${parsed.protocol}" not allowed`);
            if (parsed.origin !== this.allowedOrigin)
                return this._deny(url, `Origin mismatch: "${parsed.origin}"`);
            const path = decodeURIComponent(parsed.pathname);
            if (!path.includes('/_api/'))
                return this._deny(url, `Path does not target /_api/`);
            this._allow(url);
            return { allowed: true };
        } catch (err) {
            return this._deny(url, `Invalid URL: ${err.message}`);
        }
    }

    validateScope(serverRelativeUrl) {
        const normalized = serverRelativeUrl.replace(/\/+$/, '');
        if (!normalized.startsWith(this.libraryPath))
            return this._deny(serverRelativeUrl, `Outside library scope`);
        return { allowed: true };
    }

    validateLocalPath(localPath) {
        const abs = resolve(localPath);
        if (!abs.startsWith(this.mirrorRoot))
            return this._deny(localPath, `Escapes mirror root`);
        if (localPath.includes('..'))
            return this._deny(localPath, 'Contains ".." traversal');
        return { allowed: true };
    }

    validateMethod(method) {
        if (method.toUpperCase() !== 'GET')
            return this._deny(`method:${method}`, `Only GET is allowed`);
        return { allowed: true };
    }

    validateApiRequest(url, method = 'GET') {
        const m = this.validateMethod(method);
        if (!m.allowed) return m;
        return this.validateUrl(url);
    }

    validateFileOperation(serverRelativeUrl, localPath) {
        const s = this.validateScope(serverRelativeUrl);
        if (!s.allowed) return s;
        return this.validateLocalPath(localPath);
    }

    _allow(target) {
        this.auditLog.push({ timestamp: new Date().toISOString(), target, result: 'allowed' });
    }

    _deny(target, reason) {
        logger.warn(`Security DENIED: ${reason}`, { target });
        this.auditLog.push({ timestamp: new Date().toISOString(), target, result: 'denied', reason });
        return { allowed: false, reason };
    }

    getAuditSummary() {
        const allowed = this.auditLog.filter(e => e.result === 'allowed').length;
        const denied = this.auditLog.filter(e => e.result === 'denied').length;
        return { total: this.auditLog.length, allowed, denied, entries: this.auditLog };
    }
}
