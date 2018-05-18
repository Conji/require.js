require = (function($root) {
	var BufferedReader = Java.type('java.io.BufferedReader');
	var InputStreamReader = Java.type('java.io.InputStreamReader');
	var FileInputStream = Java.type('java.io.FileInputStream');
	var BufferedWriter = Java.type('java.io.BufferedWriter');
	var OutputStreamWriter = Java.type('java.io.OutputStreamWriter');
	var FileOutputStream = Java.type('java.io.FileOutputStream');
	var File = Java.type('java.io.File');
	var Path = Java.type('java.nio.file.Paths');

	var isWin32 = Java.type('java.lang.System').getProperty('os.name').startsWith('Windows');
	var sep = isWin32 ? '\\' : '/';
	var mainPackageCache = Object.create(null);
	var wrapper = [
		'(function (exports, module, require, __filename, __dirname) {',
		'\n})'
	];

	function Module(id, filename, parent) {
		this.id = id;
		this.filename = filename;
		this.parent = parent;
		this.fn = new Function();
		this.children = Object.create(null);
		this.exports = Object.create(null);
		this.isLoaded = false;
		updateChildren(this, parent);
	}

	Module._packageCache = Object.create(null);

	function fs_read(location) {
		var fIn = new BufferedReader(new InputStreamReader(new FileInputStream(location), "UTF8"));

		var line;
		var string = "";
		while ((line = fIn.readLine()) != null) {
			string += line + '\n';
		}

		fIn.close();
		return string;
	}	
	
	function path_absolute(path) {
		return Path.get(path).toAbsolutePath().toString();
	}
	
	function path_normalize(path) {
		return Path.get(path).normalize().toString();
	}
	
	function path_dirname(path) {
		var result = '';
		var subs = path.split(sep);
		for (var i = 0; i < subs.length - 1; i++) {
			result += (subs[i] + sep);
		}
		return result;
	}
	
	function path_resolve() {
		var paths = Array.prototype.slice.call(arguments);
		if (paths.length === 0) return '';
		var lastPath = Path.get(paths[0]);
		for (var i = 1; i < paths.length; i++) {
			lastPath = lastPath.resolve(Path.get(paths[i]));
		}
		
		return lastPath.toString();
	}

	function updateChildren(module, parent) {
		var child = parent && !parent.children[module.id];
		if (!child) return;
		parent.children[module.id] = module;
		module.parent = parent;
	}

	function wrap(script) {
		return wrapper[0] + script + wrapper[1];
	}

	function isRequestRelative(request) {
		return request[1] === sep || request[0] === sep || request[1] === ':' || request[1] === '.';
	}

	function resolveEntry(requestPath) {
		requestPath = path_normalize(requestPath);
		var cache = Module._packageCache[requestPath];
		if (cache) return cache;

		try {
			var jsonPath = path_resolve(requestPath, 'package.json');
			var json = fs_read(jsonPath);
			return Module._packageCache[requestPath] = JSON.parse(json).main;
		} catch (ex) {
			throw new Error('Failed to configure module ' + requestPath + ': ' + ex.message);
		}
	}

	function resolveFile(request, module) {
		request = path_normalize(request);
		if (!module) throw new Error('Cannot resolve relative file outside of module');
		if (request.indexOf($root) == -1) throw new Error('File cannot reference file outside of root directory');
		var dir = path_dirname(path_absolute(module.filename));
		return path_resolve(dir, request);
	}
	
	function tryFile(request, module) {
		var entry = '';
		if (isRequestRelative(request)) {
			return resolveFile(request, module);
		} else {
			return resolveEntry(path_resolve($root, request));
		}
		
		return fs_read(entry);
	}
	
	// 1: from the request, determine what file the request is pointing to and return a Module for it
	function resolveModule(request, module) {
		request = path_normalize(request);
		if (mainPackageCache[request]) return mainPackageCache[request];
		var file = tryFile(request, module);
		if (!file && !isRequestRelative(request)) {
			// this will happen if the package.json doesn't include a 'main' property
			file = path_resolve($root, request, 'index.js');
		}
		return new Module(request, file, module);
	}
	
	// 2: from the returned Module, compile it and return it.
	function compileModule(module) {
		var script = fs_read(module.filename);
		var wrapped = wrap(script);
		module.fn = eval(wrapped);
	}
	
	// 3: from the compiled Module, ensure the safety of the object and cache it.
	function cacheModule(module) {
		mainPackageCache[module.id] = module;
		updateChildren(module, module.parent);
	}
	
	// 4: from the completed Module, run the body function and set the exports
	function exportModule(module) {
		var args = [
			// exports
			module.exports,
			// module
			module,
			// require,
			require,
			// __filename
			module.filename,
			// __dirname
			path_dirname(module.filename)
		];
		
		module.fn.apply(null, args);
		module.isLoaded = true;
	}
	
	function require(request, parentModule) {
		if (request[0] == '@') return Java.type(request.substr(1));
		var module = resolveModule(request, parentModule);
		if (parentModule && parentModule.children[module.id]) {
			return parentModule.children[module.id].exports;
		} else if (mainPackageCache[module.id]) {
			return mainPackageCache[module.id].exports;
		}
		compileModule(module);
		cacheModule(module);
		exportModule(module);
		return module.exports;
	}

	return require;
})('node_modules'); // the root location of the installed modules