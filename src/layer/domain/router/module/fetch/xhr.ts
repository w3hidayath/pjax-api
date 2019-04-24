import { AtomicPromise } from 'spica/promise';
import { Cancellee } from 'spica/cancellation';
import { Sequence } from 'spica/sequence';
import { Either, Left, Right } from 'spica/either';
import { Cache } from 'spica/cache';
import { RouterEventMethod } from '../../../event/router';
import { FetchResponse } from '../../model/eav/value/fetch';
import { DomainError } from '../../../data/error';
import { URL, StandardURL, standardizeURL } from '../../../../../lib/url';

const memory = new Cache<string, (displayURL: URL<StandardURL>, requestURL: URL<StandardURL>) => FetchResponse>(99);
const caches = new Cache<URL.Path<StandardURL>, { etag: string; expiry: number; xhr: XMLHttpRequest; }>(99);

export function xhr(
  method: RouterEventMethod,
  displayURL: URL<StandardURL>,
  headers: Headers,
  body: FormData | null,
  timeout: number,
  rewrite: (path: URL.Path<StandardURL>) => string,
  cache: (path: string, headers: Headers) => string,
  cancellation: Cancellee<Error>
): AtomicPromise<Either<Error, FetchResponse>> {
  headers = new Headers(headers);
  void headers.set('Accept', headers.get('Accept') || 'text/html');
  const requestURL = new URL(standardizeURL(rewrite(displayURL.path)));
  if (method === 'GET' && caches.has(requestURL.path) && Date.now() > caches.get(requestURL.path)!.expiry) {
    void headers.set('If-None-Match', headers.get('If-None-Match') || caches.get(requestURL.path)!.etag);
  }
  const key = method === 'GET'
    ? cache(requestURL.path, headers) || undefined
    : undefined;
  return new AtomicPromise<Either<Error, FetchResponse>>(resolve => {
    if (key && memory.has(key)) return resolve(Right(memory.get(key)!(displayURL, requestURL)));
    const xhr = new XMLHttpRequest();
    void xhr.open(method, requestURL.path, true);
    for (const [name, value] of headers) {
      void xhr.setRequestHeader(name, value);
    }

    xhr.responseType = 'document';
    xhr.timeout = timeout;
    void xhr.send(body);

    void xhr.addEventListener("abort", () =>
      void resolve(Left(new DomainError(`Failed to request a page by abort.`))));

    void xhr.addEventListener("error", () =>
      void resolve(Left(new DomainError(`Failed to request a page by error.`))));

    void xhr.addEventListener("timeout", () =>
      void resolve(Left(new DomainError(`Failed to request a page by timeout.`))));

    void xhr.addEventListener("load", () =>
      void verify(xhr, method)
        .fmap(xhr => {
          const responseURL: URL<StandardURL> = new URL(standardizeURL(xhr.responseURL));
          if (method === 'GET') {
            for (const path of new Set([requestURL.path, responseURL.path])) {
              if (xhr.getResponseHeader('ETag') &&
                  !(xhr.getResponseHeader('Cache-Control') || '').trim().split(/[\s,]+/).includes('no-store')) {
                void caches.set(path, {
                  etag: xhr.getResponseHeader('ETag')!,
                  expiry: xhr.getResponseHeader('Cache-Control')!.trim().split(/[\s,]+/).includes('no-cache')
                    ? 0
                    : Date.now() + +(xhr.getResponseHeader('Cache-Control')!.trim().split(/[\s,]+/).find(s => s.startsWith('max-age=')) || '').split('=')[1] * 1000 || 0,
                  xhr,
                });
              }
              else {
                void caches.delete(path);
              }
            }
          }
          return (overriddenDisplayURL: URL<StandardURL>, overriddenRequestURL: URL<StandardURL>) =>
            new FetchResponse(
              responseURL.path === overriddenRequestURL.path
                ? overriddenDisplayURL
                : overriddenRequestURL.path === requestURL.path || !key
                    ? responseURL
                    : overriddenDisplayURL,
              xhr);
        })
        .fmap(f => {
          if (key) {
            void memory.set(key, f);
          }
          return f(displayURL, requestURL);
        })
        .extract(
          err => void resolve(Left(err)),
          res => void resolve(Right(res))));

    void cancellation.register(() => void xhr.abort());
  });
}

function verify(xhr: XMLHttpRequest, method: RouterEventMethod): Either<Error, XMLHttpRequest> {
  return Right<Error, XMLHttpRequest>(xhr)
    .bind(xhr => {
      const url = new URL(standardizeURL(xhr.responseURL));
      switch (true) {
        case !/2..|304/.test(`${xhr.status}`):
          return Left(new DomainError(`Failed to validate the status of response.`));
        case !xhr.responseURL:
          return Left(new DomainError(`Failed to get the response URL.`));
        case !xhr.responseXML:
          return method === 'GET' && caches.has(url.path)
            ? Right(caches.get(url.path)!.xhr)
            : Left(new DomainError(`Failed to get the response body.`));
        case !match(xhr.getResponseHeader('Content-Type'), 'text/html'):
          return Left(new DomainError(`Failed to validate the content type of response.`));
        default:
          return Right(xhr);
      }
    });
}

function match(actualContentType: string | null, expectedContentType: string): boolean {
  assert(actualContentType === null || actualContentType.split(':').length === 1);
  return Sequence
    .intersect(
      Sequence.from(parse(actualContentType || '').sort()),
      Sequence.from(parse(expectedContentType).sort()),
      (a, b) => a.localeCompare(b))
    .take(1)
    .extract()
    .length > 0;

  function parse(headerValue: string): string[] {
    return headerValue.split(';')
      .map(type => type.trim())
      .filter(type => type.length > 0);
  }
}
export { match as match_ }
