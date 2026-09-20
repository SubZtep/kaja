import { expect, test } from "bun:test"
import { dedent } from "../../lib/markdown/dedent"

test("removes the smallest indent from indented lines and trims the ends", () => {
  expect(dedent("\n    one\n      two\n    three\n")).toBe("one\n  two\nthree")
})

test("leaves unindented text alone apart from trimming", () => {
  expect(dedent("  \nplain\ntext \n")).toBe("plain\ntext")
})

test("keeps lines that start with an escape code", () => {
  expect(dedent("  \x1b[1mbold\x1b[22m\n  \x1b[3mit\x1b[23m")).toBe("\x1b[1mbold\x1b[22m\n\x1b[3mit\x1b[23m")
})
