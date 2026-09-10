package main

import (
	"github.com/gofiber/fiber/v3"
)

func main() {
	app := fiber.New()

	app.Route("/users", func(router fiber.Router) {
		router.Get("/profile", getProfile)
		router.Post("/update", updateProfile)
	})
}
