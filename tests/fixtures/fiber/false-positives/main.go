package main

type DB struct{}

func (d *DB) Get(key string) string {
	return key
}

func main() {
	db := &DB{}
	db.Get("/user")

	// app.Get("/commented", handler)
	_ = "app.Get('/in-string', handler)"
}
