package main

import (
	"net/http"

	"github.com/gofiber/fiber/v3"
)

type RouteConfig struct {
	App *fiber.App
}

type DBConfig struct {
	App string
}

func (c *RouteConfig) setupHealth() {
	health := c.App.Group("/health")
	health.Get("/live", func(ctx fiber.Ctx) error {
		return ctx.SendString("ok")
	})
	c.App.Get("/", func(ctx fiber.Ctx) error {
		return ctx.SendString("root")
	})
}

func (c *RouteConfig) setupUsers() {
	api := c.App.Group("/api/v1")
	users := api.Group("/users")
	admin := users.Group("")
	admin.Post("/search", func(ctx fiber.Ctx) error {
		return ctx.SendString("search")
	})
	admin.Post("", func(ctx fiber.Ctx) error {
		return ctx.SendString("create")
	})
	registerHelper(api)
	invalidRouterHelper(nil)
}

func registerHelper(r fiber.Router) {
	r.Get("/helper", func(ctx fiber.Ctx) error {
		return ctx.SendString("helper")
	})
}

func invalidRouterHelper(r *fiber.Router) {
	if r != nil {
		r.Get("/invalid-ptr-router", nil)
	}
}

func (d *DBConfig) NegativeCases(ctx *fiber.Ctx) {
	d.App.Get("/not-a-fiber-route")
	ctx.Get("Authorization")
	http.Get("http://example.com")
}

func main() {
	cfg := &RouteConfig{App: fiber.New()}
	cfg.setupHealth()
	cfg.setupUsers()
}
