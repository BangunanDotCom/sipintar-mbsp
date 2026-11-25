# Include inside the approved TLS API location, before exposing staging.
proxy_cache off;
proxy_no_cache 1;
proxy_cache_bypass 1;
proxy_buffering on;
proxy_redirect off;

# The enclosing server should log $uri, not $request or $request_uri.
# Never log inbound or outbound headers, request bodies, or query parameters.
