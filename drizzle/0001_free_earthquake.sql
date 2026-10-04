CREATE TABLE `operation_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action` varchar(80) NOT NULL,
	`onu` varchar(80),
	`operatorOpenId` varchar(64),
	`operatorName` varchar(160),
	`commands` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operation_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operator_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`email` varchar(320),
	`username` varchar(80) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`role` enum('tecnico','operador','admin') NOT NULL DEFAULT 'tecnico',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operator_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `operator_accounts_username_unique` UNIQUE(`username`)
);
