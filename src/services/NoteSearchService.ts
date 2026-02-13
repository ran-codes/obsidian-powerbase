import { App, TFile } from 'obsidian';

/**
 * Note discovery service using Obsidian's metadataCache.
 * Supports wikilink resolution, text-reference resolution (matching
 * by basename or frontmatter alias), and vault search.
 */
export class NoteSearchService {
	/**
	 * Search all markdown files in the vault by filename.
	 * Returns up to maxResults matches sorted by basename.
	 * If folderPath is provided, only files under that folder are returned.
	 */
	static searchNotes(app: App, query: string, maxResults = 50, folderPath?: string): TFile[] {
		let allFiles = app.vault.getMarkdownFiles();
		if (folderPath) {
			const prefix = folderPath.endsWith('/') ? folderPath : folderPath + '/';
			allFiles = allFiles.filter((f) => f.path.startsWith(prefix));
		}
		const lowerQuery = query.toLowerCase();

		const matches = allFiles.filter((file) =>
			file.basename.toLowerCase().includes(lowerQuery)
		);

		matches.sort((a, b) => a.basename.localeCompare(b.basename));

		return matches.slice(0, maxResults);
	}

	/**
	 * Get all markdown files for populating the relation picker.
	 * If folderPath is provided, only files under that folder are returned.
	 */
	static getAllNotes(app: App, folderPath?: string): TFile[] {
		let files = app.vault.getMarkdownFiles();
		if (folderPath) {
			const prefix = folderPath.endsWith('/') ? folderPath : folderPath + '/';
			files = files.filter((f) => f.path.startsWith(prefix));
		}
		files.sort((a, b) => a.basename.localeCompare(b.basename));
		return files;
	}

	/**
	 * Resolve a wikilink path to a TFile using Obsidian's link resolution.
	 */
	static resolveWikiLink(
		app: App,
		linkPath: string,
		sourcePath: string
	): TFile | null {
		return app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
	}

	/**
	 * Resolve a plain text reference to a TFile.
	 * Matches by basename (exact, case-insensitive), then by frontmatter alias.
	 * Handles the common pattern: `project: "My Project"` → `projects/My Project.md`.
	 *
	 * @param folderPath - Optional folder to scope the search (only files under this folder)
	 */
	static resolveTextReference(app: App, text: string, folderPath?: string): TFile | null {
		if (!text || typeof text !== 'string') return null;
		const lowerText = text.toLowerCase().trim();
		if (!lowerText) return null;

		let allFiles = app.vault.getMarkdownFiles();

		// Scope to folder if provided
		if (folderPath) {
			const prefix = folderPath.endsWith('/') ? folderPath : folderPath + '/';
			allFiles = allFiles.filter((f) => f.path.startsWith(prefix));
		}

		// First: exact basename match (case-insensitive)
		const byBasename = allFiles.find(
			(f) => f.basename.toLowerCase() === lowerText
		);
		if (byBasename) return byBasename;

		// Second: match by frontmatter alias
		for (const file of allFiles) {
			const cache = app.metadataCache.getFileCache(file);
			const aliases = cache?.frontmatter?.aliases;
			if (!Array.isArray(aliases)) continue;
			const match = aliases.some(
				(a: any) =>
					typeof a === 'string' && a.toLowerCase() === lowerText
			);
			if (match) return file;
		}

		return null;
	}

	/**
	 * Check if a text value resolves to any file in the vault.
	 * Used for detecting text-reference relation columns.
	 *
	 * @param folderPath - Optional folder to scope the search (only files under this folder)
	 */
	static isTextReference(app: App, text: string, folderPath?: string): boolean {
		return NoteSearchService.resolveTextReference(app, text, folderPath) !== null;
	}

	/**
	 * Sort files with MRU items first (by recency), then the rest alphabetically.
	 * Returns { mruCount, files } so callers can insert a visual divider.
	 */
	static sortWithMru(
		files: TFile[],
		recentPaths: string[]
	): { mruCount: number; files: TFile[] } {
		if (recentPaths.length === 0) return { mruCount: 0, files };

		const mruIndex = new Map(recentPaths.map((p, i) => [p, i]));
		const mruFiles: TFile[] = [];
		const rest: TFile[] = [];

		for (const f of files) {
			const pathNoExt = f.path.replace(/\.md$/, '');
			if (mruIndex.has(pathNoExt)) {
				mruFiles.push(f);
			} else if (mruIndex.has(f.path)) {
				mruFiles.push(f);
			} else {
				rest.push(f);
			}
		}

		// Sort MRU files by recency
		mruFiles.sort((a, b) => {
			const aPath = a.path.replace(/\.md$/, '');
			const bPath = b.path.replace(/\.md$/, '');
			const aIdx = mruIndex.get(aPath) ?? mruIndex.get(a.path) ?? Infinity;
			const bIdx = mruIndex.get(bPath) ?? mruIndex.get(b.path) ?? Infinity;
			return aIdx - bIdx;
		});

		return { mruCount: mruFiles.length, files: [...mruFiles, ...rest] };
	}
}
