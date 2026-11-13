#![forbid(unsafe_code)]

#[tokio::main]
async fn main() {
    let cfg = sequencer::Config::from_env();
    let server = match sequencer::start(cfg.clone()).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("could not start: {e}");
            std::process::exit(1);
        }
    };
    // The e2e test reads this line to find the port.
    println!("listening on {} db {}", server.addr, cfg.db.display());
    let _ = server.task.await;
}
