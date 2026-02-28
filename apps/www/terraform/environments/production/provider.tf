terraform {
  required_providers {
    digitalocean = {
      source = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
  cloud {
    organization = "Indobase"
    workspaces {
      name = "production-homepage"
    }
  }
}

provider "digitalocean" {
  token = var.DO_TOKEN
}