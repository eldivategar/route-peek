package main

import (
	"github.com/gofiber/fiber/v3"
)

func main() {
	public := fiber.New()
	admin := fiber.New()

	public.Get("/health", handler)
	admin.Get("/dashboard", handler)
}
