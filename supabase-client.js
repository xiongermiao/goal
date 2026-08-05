// Minimal Supabase client with localStorage persistence
(function(){
  var _url = '', _key = '', _token = null, _refreshToken = null;
  var STORAGE_TOKEN_KEY = 'sb_token';
  var STORAGE_USER_KEY = 'sb_user';
  var STORAGE_REFRESH_KEY = 'sb_refresh_token';

  // Restore token from localStorage
  try {
    _token = localStorage.getItem(STORAGE_TOKEN_KEY) || null;
    _refreshToken = localStorage.getItem(STORAGE_REFRESH_KEY) || null;
  } catch(e) {}

  function saveSession(token, user, refreshToken) {
    _token = token;
    if (refreshToken) _refreshToken = refreshToken;
    try {
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
      if (refreshToken) localStorage.setItem(STORAGE_REFRESH_KEY, refreshToken);
      if (user) localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    } catch(e) {}
  }

  function clearSession() {
    _token = null;
    _refreshToken = null;
    try {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      localStorage.removeItem(STORAGE_USER_KEY);
      localStorage.removeItem(STORAGE_REFRESH_KEY);
    } catch(e) {}
  }

  function headers() {
    var h = { 'apikey': _key, 'Content-Type': 'application/json' };
    if (_token) h['Authorization'] = 'Bearer ' + _token;
    return h;
  }

  function encodeQuery(params) {
    return Object.keys(params).map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  }

  function fetchWithTimeout(url, opts) {
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function() { controller.abort(); }, 20000) : null;
    opts = opts || {};
    if (controller) opts.signal = controller.signal;
    return fetch(url, opts).then(function(r) {
      if (timer) clearTimeout(timer);
      return r;
    }, function(e) {
      if (timer) clearTimeout(timer);
      throw e;
    });
  }

  function refreshSession() {
    if (!_refreshToken) return Promise.resolve(false);
    return fetchWithTimeout(_url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ refresh_token: _refreshToken })
    }).then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.access_token) {
          saveSession(data.access_token, data.user || null, data.refresh_token || _refreshToken);
          return true;
        }
        clearSession();
        return false;
      }).catch(function() { clearSession(); return false; });
  }

  function QueryBuilder(path) {
    this._path = path;
    this._filters = [];
    this._headers = {};
    this._body = null;
    this._method = 'GET';
  }

  QueryBuilder.prototype.select = function(cols) {
    this._method = 'GET';
    this._headers['Prefer'] = 'return=representation';
    return this;
  };

  QueryBuilder.prototype.eq = function(field, value) {
    this._filters.push(field + '=eq.' + encodeURIComponent(value));
    return this;
  };

  QueryBuilder.prototype.upsert = function(data, opts) {
    this._method = 'POST';
    this._body = JSON.stringify(data);
    this._headers['Prefer'] = 'resolution=merge-duplicates';
    return this;
  };

  QueryBuilder.prototype.insert = function(data) {
    this._method = 'POST';
    this._body = JSON.stringify(data);
    this._headers['Prefer'] = 'return=representation';
    return this;
  };

  QueryBuilder.prototype.delete = function() {
    this._method = 'DELETE';
    return this;
  };

  QueryBuilder.prototype.then = function(onFulfilled, onRejected) {
    var url = _url + '/rest/v1/' + this._path;
    if (this._filters.length) url += '?' + this._filters.join('&');
    var self = this;
    function doFetch(retried) {
      var h = headers();
      for (var k in self._headers) { h[k] = self._headers[k]; }
      return fetchWithTimeout(url, {
        method: self._method,
        headers: h,
        body: self._method !== 'GET' && self._method !== 'DELETE' && self._method !== 'HEAD' ? self._body : undefined
      }).then(function(r) {
        if (!r.ok && r.status === 401 && !retried && _token) {
          return refreshSession().then(function(ok) {
            if (ok) return doFetch(true);
            return r.text().then(function(t) { throw new Error(t); });
          });
        }
        if (!r.ok) return r.text().then(function(t) { throw new Error(t); });
        return r.text().then(function(t) {
          var data = null;
          if (t) { try { data = JSON.parse(t); } catch (e) { throw new Error(t); } }
          return { data: data, error: null };
        });
      });
    }
    return doFetch(false).catch(function(e) { return { data: null, error: e }; }).then(function(result) {
      return onFulfilled ? onFulfilled(result) : result;
    }, onRejected);
  };

  function from(table) { return new QueryBuilder(table); }

  function auth() {
    return {
      getSession: function() {
        if (!_token) return Promise.resolve({ data: { session: null }, error: null });
        function verify() {
          return fetchWithTimeout(_url + '/auth/v1/user', { headers: headers() })
            .then(function(r) {
              if (!r.ok) throw new Error('token_invalid');
              return r.json();
            });
        }
        return verify().catch(function() {
          return refreshSession().then(function(ok) {
            if (!ok) throw new Error('token_invalid');
            return verify();
          });
        }).then(function(user) {
          if (user && user.id) {
            var storedUser = null;
            try { storedUser = JSON.parse(localStorage.getItem(STORAGE_USER_KEY)); } catch(e) {}
            return { data: { session: { user: user, access_token: _token } }, error: null };
          }
          clearSession();
          return { data: { session: null }, error: null };
        }).catch(function(e) {
          clearSession();
          return { data: { session: null }, error: e };
        });
      },
      signInWithPassword: function(_ref) {
        var email = _ref.email, password = _ref.password;
        return fetchWithTimeout(_url + '/auth/v1/token?grant_type=password', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ email: email, password: password, gotrue_meta_security: {} })
        }).then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.access_token) { saveSession(data.access_token, data.user || null, data.refresh_token || null); return { data: data, error: null }; }
            return { data: null, error: { message: data.error_description || data.msg || '登录失败' } };
          }).catch(function(e) { return { data: null, error: { message: e.message } }; });
      },
      signUp: function(_ref2) {
        var email = _ref2.email, password = _ref2.password;
        return fetchWithTimeout(_url + '/auth/v1/signup', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ email: email, password: password })
        }).then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.access_token) { saveSession(data.access_token, data.user || null, data.refresh_token || null); return { data: data, error: null }; }
            if (data.id) return { data: data, error: null };
            return { data: null, error: { message: data.msg || '注册失败' } };
          }).catch(function(e) { return { data: null, error: { message: e.message } }; });
      },
      signOut: function() {
        return fetchWithTimeout(_url + '/auth/v1/logout', { method: 'POST', headers: headers() })
          .then(function() { clearSession(); return { error: null }; })
          .catch(function(e) { clearSession(); return { error: null }; });
      }
    };
  }

  window.supabaseCreateClient = function(url, key) {
    _url = url; _key = key;
    return { from: from, auth: auth() };
  };
})();
