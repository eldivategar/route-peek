package main

import (
	"testing"

	"github.com/gofiber/fiber/v3"
)

func newTestApp() *fiber.App {
	app := fiber.New()
	app.Get("/probe", func(c fiber.Ctx) error {
		return c.SendString("probe test route")
	})
	return app
}

func TestProbe(t *testing.T) {
	app := newTestApp()
	if app == nil {
		t.Fatal("nil app")
	}
}
