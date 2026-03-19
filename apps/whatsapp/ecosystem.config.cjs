module.exports = {
  apps: [
    {
      name: "clinplanner-whatsapp",
      cwd: __dirname,
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "768M",
      env: {
        NODE_ENV: "production",
        PORT: "4100",
      },
    },
  ],
};
