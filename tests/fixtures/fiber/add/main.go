package main

import (
	"github.com/gofiber/fiber/v3"
)

func main() {
	app := fiber.New()

	app.Add([]string{"GET", "POST"}, "/multi", handler)
	app.Add("DELETE", "/single", handler)
}
