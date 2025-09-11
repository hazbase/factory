// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

contract Example {
    string public message;

    event MessageChanged(string previous, string current);

    constructor(string memory initialMessage) {
        message = initialMessage;
    }

    function setMessage(string calldata newMessage) external {
        emit MessageChanged(message, newMessage);
        message = newMessage;
    }
}
