package handlers

import "github.com/gofiber/fiber/v3"

func Login(c fiber.Ctx) error { return c.SendStatus(200) }
func Register(c fiber.Ctx) error { return c.SendStatus(200) }
func GetProfile(c fiber.Ctx) error { return c.SendStatus(200) }
