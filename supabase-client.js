// Minimal Supabase client with localStorage persistence
(function(){
  var _url = '', _key = '', _token = null;
  var STORAGE_TOKEN_KEY = 'sb_token';
  var STORAGE_USER_KEY = 'sb_user';

  // Restore token from localStorage
  try {
    _token = localStorage.getItem(STORAGE_TOKEN_KEY) || null;
  } catch(e) {}

  function saveSession(token, user) {
    _token = token;
    try {
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
      if (user) localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    } catch(e) {}
  }

  function clearSession() {
    _token = null;
    try {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      localStorage.removeItem(STORAGE_USER_KEY);
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
    var h = headers();
    for (var k in this._headers) { h[k] = this._headers[k]; }
    return fetch(url, {
      method: this._method,
      headers: h,
      body: this._method !== 'GET' && this._method !== 'DELETE' && this._method !== 'HEAD' ? this._body : undefined
    }).then(function(r) {
      if (!r.ok) return r.text().then(function(t) { throw new Error(t); });
      if (r.status === 204) return { data: null, error: null };
      return r.json().then(function(data) { return { data: data, error: null }; });
    }).catch(function(e) { return { data: null, error: e }; }).then(function(result) {
      return onFulfilled ? onFulfilled(result) : result;
    }, onRejected);
  };

  function from(table) { return new QueryBuilder(table); }

  function auth() {
    return {
      getSession: function() {
        if (!_token) return Promise.resolve({ data: { session: null }, error: null });
        return fetch(_url + '/auth/v1/user', { headers: headers() })
          .then(function(r) {
            if (!r.ok) throw new Error('token_invalid');
            return r.json();
          })
          .then(function(user) {
            if (user && user.id) {
              var storedUser = null;
              try { storedUser = JSON.parse(localStorage.getItem(STORAGE_USER_KEY)); } catch(e) {}
              return { data: { session: { user: user, access_token: _token } }, error: null };
            }
            clearSession();
            return { data: { session: null }, error: null };
          })
          .catch(function(e) {
            clearSession();
            return { data: { session: null }, error: e };
          });
      },
      signInWithPassword: function(_ref) {
        var email = _ref.email, password = _ref.password;
        return fetch(_url + '/auth/v1/token?grant_type=password', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ email: email, password: password, gotrue_meta_security: {} })
        }).then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.access_token) { saveSession(data.access_token, data.user || null); return { data: data, error: null }; }
            return { data: null, error: { message: data.error_description || data.msg || '登录失败' } };
          }).catch(function(e) { return { data: null, error: { message: e.message } }; });
      },
      signUp: function(_ref2) {
        var email = _ref2.email, password = _ref2.password;
        return fetch(_url + '/auth/v1/signup', {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ email: email, password: password })
        }).then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.access_token) { saveSession(data.access_token, data.user || null); return { data: data, error: null }; }
            if (data.id) return { data: data, error: null };
            return { data: null, error: { message: data.msg || '注册失败' } };
          }).catch(function(e) { return { data: null, error: { message: e.message } }; });
      },
      signOut: function() {
        return fetch(_url + '/auth/v1/logout', { method: 'POST', headers: headers() })
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
