import { faker } from "@faker-js/faker"

const NUMBER_OF_JOBS = /^\d+$/.test(Bun.argv[2]) ? Number.parseInt(Bun.argv[2], 10) : 10

for (let i = 0; i < NUMBER_OF_JOBS; i++) {
  const job = {
    type: "ollama.generate",
    payload: {
      model: "gemma3:1b-it-qat",
      prompt: `Guess the food name based on this description:\n${faker.food.description()}`
    }
  }

  const res = await fetch("http://localhost:3001/kaja/create-job", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(job)
  })

  if (res.ok) {
    await Bun.write(Bun.stdout, ".")
  } else {
    // console.log("Job add fail", await res.text())
    process.exit(1)
  }
}

console.log(`\n${NUMBER_OF_JOBS} job${NUMBER_OF_JOBS === 1 ? "" : "s"} created`)
process.exit(0)
