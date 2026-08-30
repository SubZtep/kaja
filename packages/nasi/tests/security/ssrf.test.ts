import { expect, test } from "bun:test"
import { fetchPublicHttp, UnsafeUrlError } from "../../src/security/ssrf"

test("rejects loopback and private URLs", async () => {
  for (const url of [
    "http://127.0.0.1/",
    "http://localhost/",
    "http://192.168.1.1/",
    "http://10.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "file:///etc/passwd"
  ]) {
    expect(fetchPublicHttp(url)).rejects.toBeInstanceOf(UnsafeUrlError)
  }
})
