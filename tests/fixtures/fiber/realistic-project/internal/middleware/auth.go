package middleware

import "github.com/gofiber/fiber/v3"

func AuthRequired(c fiber.Ctx) error {
	return c.Next()
}
