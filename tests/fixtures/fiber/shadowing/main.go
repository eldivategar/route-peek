package main

import (
	"github.com/gofiber/fiber/v3"
)

func main() {
	app := fiber.New()

	{
		app := db.Connect()
		app.Get("/fake-user", handler)
	}

	app.Get("/real-user", handler)
}
